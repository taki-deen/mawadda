import type { Answer, Member, Prisma, PrismaClient, Review } from './generated/client';
import { digest } from './catalog';
import { isAnswered, type DraftAnswer, type Question, type Questionnaire, type QuestionView, type ReviewStatus, type SessionSummary, type SessionView } from '../src/types';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function requireRule(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}

export const sessionInclude = { questionnaire: true, members: true } satisfies Prisma.SessionInclude;
type SessionRecord = Prisma.SessionGetPayload<{ include: typeof sessionInclude }>;
type Transaction = Prisma.TransactionClient;

export async function lockSession(tx: Transaction, id: string) {
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${id} FOR UPDATE`;
}

export async function withAccount<T>(db: PrismaClient, accountId: string, work: (tx: Transaction) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.account.createMany({ data: [{ id: accountId }], skipDuplicates: true });
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
    return work(tx);
  });
}

export async function memberSession(tx: Transaction, id: string, accountId: string) {
  await lockSession(tx, id);
  const session = await tx.session.findFirst({
    where: { id, members: { some: { accountId } } }, include: sessionInclude,
  });
  requireRule(session, 404, 'الجلسة غير متاحة.');
  const member = session.members.find(candidate => candidate.accountId === accountId)!;
  const partner = session.members.find(candidate => candidate.accountId !== accountId);
  return { session, member, partner };
}

export function questionnaireFor(session: SessionRecord) {
  return session.questionnaire.content as Questionnaire;
}

export function categoryQuestions(session: SessionRecord, category: number) {
  const questions = questionnaireFor(session).questions.filter(question => question.category === category);
  requireRule(questions.length, 400, 'هذا المحور غير متاح.');
  return questions;
}

export function summarize(session: SessionRecord, accountId: string): SessionSummary {
  return {
    id: session.id,
    title: 'جلسة تعارف',
    alias: session.members.find(member => member.accountId === accountId)!.alias,
    partnerAlias: session.members.find(member => member.accountId !== accountId)?.alias ?? null,
    closed: Boolean(session.closedAt),
  };
}

export function fingerprint(answers: Answer[]) {
  const revisions = answers.map(answer => [answer.questionId, answer.revision]).sort((a, b) => a[0] - b[0]);
  return digest(JSON.stringify(revisions));
}

export async function sharedState(tx: Transaction, session: SessionRecord, questions: Question[], member: Member, partner?: Member) {
  const answers = await tx.answer.findMany({ where: { sessionId: session.id, questionId: { in: questions.map(question => question.id) } } });
  const own = answers.filter(answer => answer.accountId === member.accountId);
  const other = answers.filter(answer => answer.accountId === partner?.accountId);
  const current = fingerprint(own);
  const canShare = Boolean(partner && !session.closedAt);
  const consents = canShare ? await tx.consent.findMany({ where: { sessionId: session.id, category: questions[0].category } }) : [];
  const mineShared = consents.find(consent => consent.accountId === member.accountId)?.fingerprint === current;
  const partnerShared = consents.find(consent => consent.accountId === partner?.accountId)?.fingerprint === fingerprint(other);
  return { own, other, current, canShare, mineShared, partnerShared, open: mineShared && partnerShared };
}

function answerView(answer?: Answer): DraftAnswer {
  return answer ? { choice: answer.choice, text: answer.text, importance: answer.importance,
    deferred: answer.deferred, revision: answer.revision }
    : { choice: '', text: '', importance: 1, deferred: false, revision: 0 };
}

export async function viewSession(tx: Transaction, session: SessionRecord, category: number, member: Member, partner?: Member): Promise<SessionView> {
  const selected = categoryQuestions(session, category);
  const { categories, questions: catalog } = questionnaireFor(session);
  const sharing = await sharedState(tx, session, selected, member, partner);
  const completedAnswers = await tx.answer.findMany({
    where: { sessionId: session.id, accountId: member.accountId, deferred: false,
      OR: [{ choice: { not: '' } }, { text: { not: '' } }] },
    select: { questionId: true },
  });
  const completedIds = new Set(completedAnswers.map(answer => answer.questionId));
  const categoryProgress = categories.map(() => ({ completed: 0, total: 0 }));
  for (const question of catalog) {
    categoryProgress[question.category].total++;
    if (completedIds.has(question.id)) categoryProgress[question.category].completed++;
  }
  const reviews = sharing.open ? await tx.review.findMany({ where: { sessionId: session.id, questionId: { in: selected.map(question => question.id) } } }) : [];
  const questions = selected.map<QuestionView>(question => {
    const review = reviews.find(item => item.questionId === question.id);
    const answer = answerView(sharing.own.find(item => item.questionId === question.id));
    if (!sharing.open) return { ...question, answer };
    const partnerAnswer = answerView(sharing.other.find(item => item.questionId === question.id));
    const disclosed = isAnswered(partnerAnswer) ? partnerAnswer : { ...answerView(), deferred: partnerAnswer.deferred };
    return { ...question, answer, partner: disclosed, review: review && reviewView(review, member.seat) };
  });

  let paired = 0;
  let scored = 0;
  let approved = 0;
  let weighted = 0;
  let weights = 0;
  for (const question of questions) {
    const { answer, partner: other, review } = question;
    if (!other || !isAnswered(answer) || !isAnswered(other)) continue;
    paired++;
    let score: number | undefined;
    if (review?.mine && review.partner) {
      approved++;
      score = { agree: 1, partial: 0.5, different: 0 }[review.status];
    } else if (question.auto && answer.choice && other.choice && !answer.text && !other.text) {
      score = Number(answer.choice === other.choice);
    }
    if (score === undefined) continue;
    const weight = Math.max(answer.importance, other.importance);
    scored++;
    weighted += weight * score;
    weights += weight;
  }

  return { ...summarize(session, member.accountId), category, categories, categoryProgress, title: categories[category],
    canInvite: !partner && member.seat === 1 && !session.closedAt,
    canShare: sharing.canShare, mineShared: sharing.mineShared, partnerShared: sharing.partnerShared,
    comparisonOpen: sharing.open, fingerprint: sharing.current,
    completed: categoryProgress[category].completed, questions,
    report: sharing.open ? { paired, scored, approved, score: weights ? Math.round(100 * weighted / weights) : null } : null };
}

function reviewView(review: Review, seat: number) {
  return { status: review.status as ReviewStatus, note: review.note, revision: review.revision,
    mine: seat === 1 ? review.approvedOne : review.approvedTwo,
    partner: seat === 1 ? review.approvedTwo : review.approvedOne };
}
