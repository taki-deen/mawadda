import { z } from 'zod';
import type { AdminStats, ContentDraft, CustomField, CustomValues } from '../src/adminTypes';
import { manualOnlyQuestionIds, type Questionnaire } from '../src/types';
import { digest } from './catalog';
import { requireRule } from './domain';
import type { Prisma } from './generated/client';

const label = z.string().trim().min(1).max(100);
const options = z.array(z.string().trim().min(1).max(120)).max(20)
  .refine(items => new Set(items).size === items.length, 'الخيارات المكررة غير متاحة.');

const question = z.strictObject({
  id: z.number().int().min(1).max(2147483647), category: z.number().int().min(0).max(14),
  text: z.string().trim().min(1).max(600), options: options.nullable(), auto: z.boolean(),
}).refine(item => (!item.options || item.options.length >= 2) && (!item.auto || Boolean(item.options)),
  'السؤال الاختياري يحتاج خيارين، والسؤال المفتوح يحتاج تقييمًا يدويًا.')
  .refine(item => !item.auto || !manualOnlyQuestionIds.has(item.id), 'أسئلة الإفصاح تحتاج تقييمًا يدويًا.');

const customField = z.strictObject({ id: z.uuid(), label, kind: z.enum(['text', 'number', 'choice']), options })
  .refine(field => field.kind === 'choice' ? field.options.length >= 2 : field.options.length === 0);

const draftSchema = z.strictObject({ questionnaire: z.strictObject({
  categories: z.array(label).length(15), questions: z.array(question).max(500),
}), fields: z.array(customField).max(40) }).refine(draft =>
  new Set(draft.questionnaire.questions.map(item => item.id)).size === draft.questionnaire.questions.length &&
  new Set(draft.fields.map(item => item.id)).size === draft.fields.length);

const revision = z.number().int().min(0).max(2147483646);
export const saveDraftSchema = z.strictObject({ revision, draft: draftSchema });
export const publishSchema = z.strictObject({ revision });
export const customValuesSchema = z.record(z.uuid(), z.union([z.string().trim().max(250), z.number().finite(), z.null()]))
  .refine(values => Object.keys(values).length <= 40);

export async function contentState(tx: Prisma.TransactionClient, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM "ContentState" WHERE id = 'main' FOR UPDATE`;
  return tx.contentState.findUniqueOrThrow({ where: { id: 'main' } });
}

export async function adminContentView(tx: Prisma.TransactionClient, canPublish: boolean) {
  const state = await contentState(tx);
  const events = await tx.contentEvent.findMany({ orderBy: { id: 'desc' }, take: 25 });
  return { revision: state.revision, highestQuestionId: state.highestQuestionId, draft: state.draft as ContentDraft,
    publishedId: state.publishedId, canPublish, events };
}

export async function saveDraft(tx: Prisma.TransactionClient, actor: string, input: z.infer<typeof saveDraftSchema>) {
  const state = await contentState(tx, true);
  requireRule(input.revision === state.revision, 409, 'تغيّرت المسودة. حدّث الصفحة قبل الحفظ.');
  const prior = state.draft as ContentDraft;
  const priorQuestionIds = new Set(prior.questionnaire.questions.map(item => item.id));
  requireRule(input.draft.questionnaire.questions.every(item => priorQuestionIds.has(item.id) || item.id > state.highestQuestionId),
    400, 'استخدم رقمًا جديدًا عند إضافة سؤال.');
  const published = await tx.questionnaire.findUniqueOrThrow({ where: { id: state.publishedId }, select: { content: true } });
  const publishedQuestionIds = new Set((published.content as Questionnaire).questions.map(item => item.id));
  const publishedFieldIds = new Set((state.publishedFields as CustomField[]).map(item => item.id));
  const nextQuestions = new Set(input.draft.questionnaire.questions.map(item => item.id));
  const nextFields = new Set(input.draft.fields.map(item => item.id));
  const events = [
    ...prior.questionnaire.questions.filter(item => !nextQuestions.has(item.id)).map(item => ({ actor,
      action: publishedQuestionIds.has(item.id) ? 'archive_question' : 'delete_question', subject: item.text })),
    ...prior.fields.filter(item => !nextFields.has(item.id)).map(item => ({ actor,
      action: publishedFieldIds.has(item.id) ? 'archive_field' : 'delete_field', subject: item.label })),
  ];
  await tx.contentState.update({ where: { id: 'main' }, data: { draft: input.draft, revision: { increment: 1 },
    highestQuestionId: Math.max(state.highestQuestionId, ...nextQuestions) } });
  await tx.contentEvent.create({ data: { actor, action: 'save_draft', subject: `مراجعة ${state.revision + 1}` } });
  if (events.length) await tx.contentEvent.createMany({ data: events });
}

export async function publishDraft(tx: Prisma.TransactionClient, actor: string, expected: number) {
  const state = await contentState(tx, true);
  requireRule(state.revision === expected, 409, 'تغيّرت المسودة. راجعها قبل النشر.');
  const { questionnaire, fields } = draftSchema.parse(state.draft);
  requireRule(questionnaire.categories.every((_name, index) => questionnaire.questions.some(item => item.category === index)),
    400, 'أضف سؤالًا واحدًا على الأقل في كل محور قبل النشر.');
  const id = digest(JSON.stringify(questionnaire));
  await tx.questionnaire.createMany({ data: [{ id, content: questionnaire }], skipDuplicates: true });
  await tx.contentState.update({ where: { id: 'main' }, data: { publishedId: id, publishedFields: fields, revision: { increment: 1 } } });
  await tx.contentEvent.create({ data: { actor, action: 'publish', subject: `${questionnaire.questions.length} سؤالًا، ${fields.length} حقول إضافية` } });
}

export function validCustomValue(field: CustomField, value: unknown): value is string | number {
  if (field.kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.kind === 'choice') return typeof value === 'string' && field.options.includes(value);
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 250;
}

export function visibleCustomValues(fields: CustomField[], stored: Prisma.JsonValue) {
  const values = stored as CustomValues;
  return Object.fromEntries(fields.flatMap(field => validCustomValue(field, values[field.id]) ? [[field.id, values[field.id]]] : []));
}

export async function updateCustomValues(tx: Prisma.TransactionClient, accountId: string, submitted: z.infer<typeof customValuesSchema>, expected?: string) {
  const state = await contentState(tx, true);
  const fields = state.publishedFields as CustomField[];
  requireRule(expected === digest(JSON.stringify(fields)), 409, 'تغيّرت حقول الملف. افتح الصفحة مجددًا قبل الحفظ.');
  const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { customProfile: true } });
  const values = { ...account.customProfile as CustomValues };
  for (const [id, value] of Object.entries(submitted)) {
    const field = fields.find(item => item.id === id);
    requireRule(field, 409, 'تغيّرت حقول الملف. افتح الصفحة مجددًا قبل الحفظ.');
    if (value === null) delete values[id];
    else {
      requireRule(validCustomValue(field, value), 400, `راجع قيمة حقل ${field.label}.`);
      values[id] = value;
    }
  }
  return values;
}

export async function adminStats(tx: Prisma.TransactionClient, query: unknown): Promise<AdminStats> {
  const filters = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).parse(query);
  requireRule(!filters.from || !filters.to || filters.from <= filters.to, 400, 'تاريخ البداية يجب أن يسبق النهاية.');
  const state = await contentState(tx);
  const records = await tx.questionnaire.findMany({ select: { id: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const selectedVersion = filters.version ?? state.publishedId;
  const selected = await tx.questionnaire.findUnique({ where: { id: selectedVersion }, select: { content: true } });
  requireRule(selected, 404, 'إصدار الاستبيان غير متاح.');
  const catalog = selected.content as Questionnaire;
  const createdAt = { gte: filters.from ? new Date(filters.from) : undefined,
    lt: filters.to ? new Date(new Date(filters.to).getTime() + 86400000) : undefined };
  const accounts = await tx.account.count({ where: { email: { not: null }, createdAt } });
  const sessions = await tx.session.findMany({ where: { questionnaireId: selectedVersion, createdAt }, select: {
    firstComparisonAt: true,
    members: { select: { seat: true, answers: { where: { deferred: false, OR: [{ choice: { not: '' } }, { text: { not: '' } }] }, select: { questionId: true } } } },
  } });
  const questionCategories = new Map(catalog.questions.map(item => [item.id, item.category]));
  const sizes = catalog.categories.map((_title, index) => catalog.questions.filter(item => item.category === index).length);
  const categories = catalog.categories.map(title => ({ title, started: 0, completed: 0 }));
  for (const session of sessions) {
    const counts = session.members.map(member => {
      const totals = sizes.map(() => 0);
      for (const answer of member.answers) {
        const category = questionCategories.get(answer.questionId);
        if (category !== undefined) totals[category]++;
      }
      return totals;
    });
    categories.forEach((category, index) => {
      if (counts.some(member => member[index] > 0)) category.started++;
      if (sizes[index] && counts.length === 2 && counts.every(member => member[index] === sizes[index])) category.completed++;
    });
  }
  return { accounts, sessions: sessions.length, joined: sessions.filter(session => session.members.some(member => member.seat === 2)).length,
    comparisons: sessions.filter(session => session.firstComparisonAt).length, categories, selectedVersion,
    versions: records.map((item, index) => ({ ...item, number: index + 1, createdAt: item.createdAt.toISOString() })) };
}
