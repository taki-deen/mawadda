import { randomBytes } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import { demoAdminEmail, demoOwnerEmail, isAnswered, type AccountProfile, type Config } from '../src/types';
import { makeAuth, type Identity } from './auth';
import { digest } from './catalog';
import { cityOptions, countryName, countryOptions, findCity } from './locations';
import { personalDetailsInputSchema, personalDetailsSchema, shareAccountFields, shareableValues } from './personalProfiles';
import { sharedProfileKeys, type PersonalDetails, type SessionProfile, type SharedProfileKey } from '../src/personalProfile';
import type { CustomField } from '../src/adminTypes';
import { adminContentView, adminStats, contentState, customValuesSchema, publishDraft, publishSchema, saveDraft, saveDraftSchema,
  updateCustomValues, visibleCustomValues } from './adminContent';
import { HttpError, categoryQuestions, lockSession, memberSession, questionnaireFor, requireRule, sessionInclude, sharedState, summarize, viewSession, withAccount } from './domain';
import type { Prisma, PrismaClient } from './generated/client';

const email = z.email().max(254).transform(value => value.toLowerCase());
const alias = z.string().trim().min(1).max(60);
const revision = z.number().int().min(0).max(2147483646);
const categoryIndex = z.number().int().min(0).max(14);
const categoryQuery = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(categoryIndex).optional().transform(value => value ?? 0);
const answerSchema = z.strictObject({ choice: z.string().max(120), text: z.string().trim().max(3000),
  importance: z.number().int().min(1).max(3), deferred: z.boolean(), revision });
const reviewSchema = z.strictObject({ status: z.enum(['agree', 'partial', 'different']), note: z.string().trim().max(2000), revision });
const inviteToken = z.string().regex(/^[\w-]{43}$/);
const accountFields = { id: true, email: true, displayName: true, city: true, countryCode: true, cityId: true, engagement: true, profileRevision: true } as const;
const countryCode = z.string().regex(/^[A-Z]{2}$/);
const profileBasics = { displayName: z.string().trim().min(1).max(60),
  engagement: z.enum(['undisclosed', 'not_engaged', 'fiance', 'fiancee']), profileRevision: revision };
const oldProfileSchema = z.strictObject({ ...profileBasics, city: z.string().trim().max(80) });
const locationFields = { ...profileBasics, location: z.strictObject({ countryCode: countryCode.or(z.literal('')),
  cityId: z.string().regex(/^\d{1,10}$/).nullable() }).optional() };
const profileSchema = z.union([oldProfileSchema, z.strictObject(locationFields)]);
const selfProfileSchema = z.union([oldProfileSchema, z.strictObject({ ...locationFields,
  personalDetails: personalDetailsInputSchema.optional(), customValues: customValuesSchema.optional(),
  customFieldsVersion: z.string().regex(/^[a-f0-9]{64}$/).optional() })]);
const profileShareSchema = z.strictObject({ profileRevision: revision,
  fieldsVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  fields: z.array(z.union([z.enum(sharedProfileKeys), z.templateLiteral(['custom:', z.uuid()])])).max(sharedProfileKeys.length + 40) });

export function createApp(db: PrismaClient, _questionnaireId: string, config: Config, buildDir?: string, appOrigin?: string,
  managedAdmins: readonly string[] = [], managedOwners: readonly string[] = [], demoOwnerPassword?: string) {
  const app = express();
  const auth = makeAuth(config, demoOwnerPassword);
  const owners = new Set(config.demo ? (demoOwnerPassword ? [`demo:${demoOwnerEmail}`] : []) : managedOwners.map(id => `supabase:${id}`));
  const admins = new Set(config.demo ? [`demo:${demoAdminEmail}`] : managedAdmins.map(id => `supabase:${id}`));
  for (const owner of owners) admins.add(owner);
  const publicProfile = (record: Omit<AccountProfile, 'role' | 'engagement'> & { engagement: string }): AccountProfile => ({
    ...record, countryName: record.countryCode ? countryName(record.countryCode) : '',
    engagement: record.engagement as AccountProfile['engagement'], role: admins.has(record.id) ? 'admin' : 'user',
  });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
    const connect = config.demo ? '' : ` ${new URL(config.authUrl).origin}`;
    res.set('Content-Security-Policy', `default-src 'self'; connect-src 'self'${connect}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    const loopback = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.get('host') ?? '');
    requireRule(!config.demo || loopback, 403, 'التجربة المحلية متاحة على هذا الجهاز فقط.');
    const origin = req.get('origin');
    const localOrigin = `http://${req.get('host')}`;
    requireRule(!origin || ['GET', 'HEAD'].includes(req.method) || origin === (config.demo ? localOrigin : appOrigin), 403, 'الطلب غير مسموح من هذا المصدر.');
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/admin/content', express.json({ limit: '2mb' }));
  app.use('/api', express.json({ limit: '24kb' }));
  app.get('/api/config', (_req, res) => { res.json(config); });
  app.get('/api/locations/countries', (_req, res) => { res.json(countryOptions()); });
  app.get('/api/locations/cities', (req, res) => {
    const country = countryCode.parse(req.query.country);
    const query = z.string().max(80).optional().parse(req.query.q) ?? '';
    requireRule(countryName(country), 400, 'اختر دولة من القائمة.');
    res.json(cityOptions(country, query));
  });

  function token(req: Request) {
    const match = /^Bearer ([\w.-]{20,4096})$/.exec(req.get('authorization') ?? '');
    requireRule(match, 401, 'سجّل الدخول للمتابعة.');
    return match[1];
  }

  const route = (handler: (req: Request, tx: Prisma.TransactionClient, identity: Identity) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const identity = await auth.verify(token(req));
      res.json(await withAccount(db, identity.id, tx => handler(req, tx, identity)));
    };

  const sessionRoute = (handler: (req: Request, tx: Prisma.TransactionClient,
    context: Awaited<ReturnType<typeof memberSession>>, identity: Identity) => Promise<unknown>) =>
    route(async (req, tx, identity) => {
      const id = z.uuid().parse(req.params.id);
      const context = await memberSession(tx, id, identity.id);
      return handler(req, tx, context, identity);
    });

  if (config.demo) {
    app.post('/api/dev/sign-in', (req, res) => { res.json({ token: auth.signIn(email.parse(req.body?.email)) }); });
    app.post('/api/dev/password', async (req, res) => {
      const input = z.strictObject({ email, password: z.string().min(8).max(128), register: z.boolean() }).parse(req.body);
      res.json({ token: await auth.password(input.email, input.password, input.register) });
    });
    app.post('/api/dev/sign-out', (req, res) => { auth.signOut(token(req)); res.json({ ok: true }); });
  }

  const ownAccountFields = { ...accountFields, personalDetails: true, customProfile: true } as const;
  async function ownProfile(tx: Prisma.TransactionClient, { personalDetails, customProfile, ...record }: Prisma.AccountGetPayload<{ select: typeof ownAccountFields }>) {
    const fields = (await contentState(tx)).publishedFields as CustomField[];
    return { ...publicProfile(record), personalDetails: personalDetailsSchema.parse(personalDetails),
      ...(fields.length ? { customFields: fields, customValues: visibleCustomValues(fields, customProfile),
        customFieldsVersion: digest(JSON.stringify(fields)) } : {}),
      ...(admins.has(record.id) ? { hasContentAdmin: true } : {}) };
  }

  app.get('/api/account', route(async (_req, tx, identity) => {
    const record = await tx.account.update({ where: { id: identity.id }, data: { email: identity.email }, select: ownAccountFields });
    return ownProfile(tx, record);
  }));

  async function updateProfile(tx: Prisma.TransactionClient, id: string, input: z.infer<typeof profileSchema>, personalDetails?: PersonalDetails,
    customProfile?: Record<string, string | number>) {
    const { profileRevision, displayName, engagement } = input;
    const previous = await tx.account.findUnique({ where: { id }, select: { city: true } });
    requireRule(previous, 404, 'الملف غير متاح.');

    let location: Pick<Prisma.AccountUpdateManyMutationInput, 'city' | 'countryCode' | 'cityId'> = {};
    if ('location' in input && input.location) {
      const { countryCode, cityId } = input.location;
      requireRule(!countryCode || countryName(countryCode), 400, 'اختر دولة من القائمة.');
      const city = cityId ? findCity(countryCode, cityId) : undefined;
      requireRule(!cityId || city, 400, 'اختر مدينة تابعة للدولة المحدّدة.');
      location = { countryCode, cityId, city: city?.name ?? '' };
    } else if ('city' in input && input.city !== previous.city) {
      location = { city: input.city, countryCode: '', cityId: null };
    }

    const saved = await tx.account.updateMany({ where: { id, profileRevision },
      data: { ...location, displayName, engagement, personalDetails, customProfile, profileRevision: { increment: 1 } } });
    requireRule(saved.count === 1, 409, 'تغيّر الملف. افتح أحدث نسخة قبل الحفظ.');
  }

  app.put('/api/account', route(async (req, tx, identity) => {
    const input = selfProfileSchema.parse(req.body);
    const custom = 'customValues' in input && input.customValues
      ? await updateCustomValues(tx, identity.id, input.customValues, input.customFieldsVersion) : undefined;
    await updateProfile(tx, identity.id, input, 'personalDetails' in input ? input.personalDetails : undefined, custom);
    return ownProfile(tx, await tx.account.findUniqueOrThrow({ where: { id: identity.id }, select: ownAccountFields }));
  }));

  app.get('/api/admin/content', route(async (_req, tx, identity) => {
    requireRule(admins.has(identity.id), 403, 'هذه الصفحة للأدمن.');
    return adminContentView(tx, owners.has(identity.id));
  }));

  app.put('/api/admin/content', route(async (req, tx, identity) => {
    requireRule(admins.has(identity.id), 403, 'هذه الصفحة للأدمن.');
    await saveDraft(tx, identity.email, saveDraftSchema.parse(req.body));
    return adminContentView(tx, owners.has(identity.id));
  }));

  app.post('/api/admin/content/publish', route(async (req, tx, identity) => {
    requireRule(owners.has(identity.id), 403, 'نشر الإصدارات متاح لمالك النظام.');
    await publishDraft(tx, identity.email, publishSchema.parse(req.body).revision);
    return adminContentView(tx, true);
  }));

  app.get('/api/admin/dashboard', route(async (req, tx, identity) => {
    requireRule(admins.has(identity.id), 403, 'هذه الصفحة للأدمن.');
    return adminStats(tx, req.query);
  }));

  app.get('/api/admin/users', route(async (req, tx, identity) => {
    requireRule(admins.has(identity.id), 403, 'هذه الصفحة للأدمن.');
    const after = z.string().min(1).max(320).optional().parse(req.query.after);
    const q = z.string().trim().max(80).optional().parse(req.query.q);
    const accounts = await tx.account.findMany({
      where: { id: after ? { gt: after } : undefined, OR: q ? [
        { displayName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } },
      ] : undefined },
      select: accountFields, orderBy: { id: 'asc' }, take: 41,
    });
    const users = accounts.slice(0, 40).map(publicProfile);
    return { users, next: accounts.length > 40 ? users[39].id : null };
  }));

  app.put('/api/admin/users/:id', route(async (req, tx, identity) => {
    requireRule(admins.has(identity.id), 403, 'هذه الصفحة للأدمن.');
    const id = z.string().min(1).max(320).parse(req.params.id);
    await updateProfile(tx, id, profileSchema.parse(req.body));
    return publicProfile(await tx.account.findUniqueOrThrow({ where: { id }, select: accountFields }));
  }));

  app.get('/api/me', async (req, res) => {
    const identity = await auth.verify(token(req));
    const sessions = await db.session.findMany({ where: { members: { some: { accountId: identity.id } } },
      orderBy: { createdAt: 'desc' }, include: sessionInclude });
    res.json({ email: identity.email, sessions: sessions.map(session => summarize(session, identity.id)) });
  });

  app.post('/api/sessions', route(async (req, tx, identity) => {
    const input = z.strictObject({ alias }).parse(req.body);
    const { publishedId: questionnaireId } = await contentState(tx);
    const session = await tx.session.create({ data: { questionnaireId,
      members: { create: { accountId: identity.id, seat: 1, alias: input.alias } } } });
    return { id: session.id };
  }));

  app.post('/api/sessions/:id/invite', sessionRoute(async (req, tx, { session, member, partner }, identity) => {
    const recipient = z.strictObject({ email }).parse(req.body).email;
    requireRule(!session.closedAt && member.seat === 1 && !partner, 409, 'الدعوة غير متاحة لهذه الجلسة.');
    requireRule(recipient !== identity.email, 400, 'اكتب بريد الطرف الآخر.');
    const code = randomBytes(32).toString('base64url');
    await tx.invitation.deleteMany({ where: { sessionId: session.id } });
    await tx.invitation.create({ data: { digest: digest(code), email: recipient, sessionId: session.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    return { code };
  }));

  app.post('/api/invitations/accept', route(async (req, tx, identity) => {
    const input = z.strictObject({ code: inviteToken, alias }).parse(req.body);
    const key = digest(input.code);
    const first = await tx.invitation.findUnique({ where: { digest: key } });
    requireRule(first && first.email === identity.email, 404, 'الدعوة غير متاحة لهذا الحساب.');
    await lockSession(tx, first.sessionId);
    const invitation = await tx.invitation.findUnique({ where: { digest: key }, include: { session: { include: { members: true } } } });
    requireRule(invitation && !invitation.session.closedAt && invitation.expiresAt > new Date() && invitation.session.members.length === 1 &&
      !invitation.session.members.some(member => member.accountId === identity.id), 409, 'انتهت الدعوة أو استُخدمت. اطلب رابطًا جديدًا.');
    await tx.member.create({ data: { sessionId: invitation.sessionId, accountId: identity.id, seat: 2, alias: input.alias } });
    await tx.invitation.delete({ where: { digest: key } });
    return { id: invitation.sessionId };
  }));

  app.get('/api/sessions/:id', sessionRoute(async (req, tx, { session, member, partner }) =>
    viewSession(tx, session, categoryQuery.parse(req.query.category), member, partner)));

  async function readProfileShare(tx: Prisma.TransactionClient, { session, member, partner }: Awaited<ReturnType<typeof memberSession>>,
    fields: CustomField[], fieldsVersion: string): Promise<SessionProfile> {
    const own = await tx.account.findUniqueOrThrow({ where: { id: member.accountId }, select: shareAccountFields });
    const canShare = Boolean(partner && !session.closedAt);
    const available = shareableValues(own, fields);
    const partnerProfile = canShare && partner?.sharedProfileFields.length && partner.sharedProfileRevision !== null
      ? await tx.account.findFirst({ where: { id: partner.accountId, profileRevision: partner.sharedProfileRevision }, select: shareAccountFields })
      : null;
    const permitted = (key: SharedProfileKey, participant: typeof member) => participant.sharedProfileFields.includes(key) &&
      (!key.startsWith('custom:') || participant.sharedFieldsVersion === fieldsVersion);
    return { canShare, available, profileRevision: own.profileRevision, fieldsVersion,
      selected: canShare && member.sharedProfileRevision === own.profileRevision
        ? available.filter(item => permitted(item.key, member)).map(item => item.key) : [],
      partner: partnerProfile && partner ? shareableValues(partnerProfile, fields).filter(item => permitted(item.key, partner)) : [],
    };
  }

  app.get('/api/sessions/:id/profile-share', sessionRoute(async (_req, tx, context) => {
    const fields = (await contentState(tx)).publishedFields as CustomField[];
    return readProfileShare(tx, context, fields, digest(JSON.stringify(fields)));
  }));

  app.put('/api/sessions/:id/profile-share', sessionRoute(async (req, tx, context) => {
    const input = profileShareSchema.parse(req.body);
    const fields = [...new Set(input.fields)];
    const definitions = (await contentState(tx, true)).publishedFields as CustomField[];
    const fieldsVersion = digest(JSON.stringify(definitions));
    const view = await readProfileShare(tx, context, definitions, fieldsVersion);
    if (fields.length) {
      requireRule(view.canShare, 409, 'المشاركة متاحة بعد انضمام الطرف الآخر لجلسة مفتوحة.');
      requireRule(view.profileRevision === input.profileRevision, 409, 'تغيّر ملفك. راجع المعاينة وحدّد الحقول مجددًا.');
      requireRule(!fields.some(key => key.startsWith('custom:')) || input.fieldsVersion === fieldsVersion,
        409, 'تغيّرت حقول الملف. راجع المعاينة قبل المشاركة.');
      requireRule(fields.every(key => view.available.some(item => item.key === key)), 400, 'اختر حقولًا موجودة في ملفك.');
    }
    const { sessionId, accountId } = context.member;
    await tx.member.update({ where: { sessionId_accountId: { sessionId, accountId } },
      data: { sharedProfileFields: fields, sharedProfileRevision: fields.length ? view.profileRevision : null,
        sharedFieldsVersion: fields.length ? fieldsVersion : null } });
    return { ...view, selected: fields };
  }));

  app.put('/api/sessions/:id/answers/:question', sessionRoute(async (req, tx, { session, member }) => {
    requireRule(!session.closedAt, 409, 'انتهت الجلسة.');
    const { revision: previous, ...input } = answerSchema.parse(req.body);
    const question = questionnaireFor(session).questions.find(item => String(item.id) === req.params.question);
    requireRule(question && (!input.choice || question.options?.includes(input.choice)), 400, 'الإجابة لا تطابق السؤال.');
    const key = { sessionId: session.id, accountId: member.accountId, questionId: question.id };
    const where = { sessionId_accountId_questionId: key };
    const saved = await tx.answer.findUnique({ where });
    requireRule((saved?.revision ?? 0) === previous, 409, 'تغيّرت الإجابة في تبويب آخر. حدّث الصفحة وحاول مجددًا.');
    if (saved && saved.choice === input.choice && saved.text === input.text && saved.importance === input.importance && saved.deferred === input.deferred) return { ok: true };
    const data = { ...input, revision: previous + 1 };
    await tx.answer.upsert({ where, create: { ...key, ...data }, update: data });
    await tx.consent.deleteMany({ where: { sessionId: session.id, accountId: member.accountId, category: question.category } });
    await tx.review.updateMany({ where: { sessionId: session.id, questionId: question.id },
      data: { revision: { increment: 1 }, approvedOne: false, approvedTwo: false } });
    return { ok: true };
  }));

  app.put('/api/sessions/:id/consent', sessionRoute(async (req, tx, { session, member, partner }) => {
    const input = z.discriminatedUnion('share', [z.strictObject({ share: z.literal(false), category: categoryIndex.default(0) }),
      z.strictObject({ share: z.literal(true), category: categoryIndex.default(0), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })]).parse(req.body);
    const key = { sessionId: session.id, accountId: member.accountId, category: input.category };
    if (!input.share) {
      await tx.consent.deleteMany({ where: key });
      return { ok: true };
    }
    const sharing = await sharedState(tx, session, categoryQuestions(session, input.category), member, partner);
    requireRule(sharing.canShare && sharing.own.some(isAnswered), 409, 'أجب عن سؤال واحد على الأقل وانتظر انضمام الطرف الآخر.');
    requireRule(input.fingerprint === sharing.current, 409, 'تغيّرت إجاباتك. راجعها قبل المشاركة.');
    await tx.consent.upsert({ where: { sessionId_accountId_category: key },
      create: { ...key, fingerprint: sharing.current }, update: { fingerprint: sharing.current } });
    if (sharing.partnerShared && !session.firstComparisonAt) {
      await tx.session.update({ where: { id: session.id }, data: { firstComparisonAt: new Date() } });
    }
    return { ok: true };
  }));

  const reviewRoute = (approve: boolean) => sessionRoute(async (req, tx, { session, member, partner }) => {
    const question = questionnaireFor(session).questions.find(item => String(item.id) === req.params.question);
    requireRule(question, 404, 'السؤال غير متاح.');
    const sharing = await sharedState(tx, session, categoryQuestions(session, question.category), member, partner);
    requireRule(sharing.open, 403, 'تحتاج المقارنة إلى موافقة الطرفين.');
    const mine = sharing.own.find(answer => answer.questionId === question.id);
    const other = sharing.other.find(answer => answer.questionId === question.id);
    requireRule(mine && other && isAnswered(mine) && isAnswered(other), 409, 'أكمل الطرفان الإجابة أولًا.');
    const key = { sessionId: session.id, questionId: question.id };
    const where = { sessionId_questionId: key };
    const saved = await tx.review.findUnique({ where });
    if (approve) {
      const input = z.strictObject({ revision }).parse(req.body);
      requireRule(saved && saved.revision === input.revision, 409, 'تغيّرت الملاحظة. راجع نسختها الأخيرة.');
      await tx.review.update({ where, data: member.seat === 1 ? { approvedOne: true } : { approvedTwo: true } });
    } else {
      const input = reviewSchema.parse(req.body);
      requireRule((saved?.revision ?? 0) === input.revision, 409, 'تغيّرت الملاحظة. راجع نسختها الأخيرة.');
      if (saved && saved.status === input.status && saved.note === input.note) return { ok: true };
      const data = { status: input.status, note: input.note, revision: input.revision + 1, approvedOne: false, approvedTwo: false };
      await tx.review.upsert({ where, create: { ...key, ...data }, update: data });
    }
    return { ok: true };
  });

  app.put('/api/sessions/:id/reviews/:question', reviewRoute(false));
  app.post('/api/sessions/:id/reviews/:question/approve', reviewRoute(true));

  async function closeSession(tx: Prisma.TransactionClient, id: string) {
    await tx.session.updateMany({ where: { id, closedAt: null }, data: { closedAt: new Date() } });
    await tx.member.updateMany({ where: { sessionId: id }, data: { sharedProfileFields: [], sharedProfileRevision: null, sharedFieldsVersion: null } });
    await tx.consent.deleteMany({ where: { sessionId: id } });
    await tx.invitation.deleteMany({ where: { sessionId: id } });
  }

  app.post('/api/sessions/:id/close', sessionRoute(async (_req, tx, { session }) => {
    await closeSession(tx, session.id);
    return { ok: true };
  }));

  app.delete('/api/me', route(async (_req, tx, identity) => {
    const memberships = await tx.member.findMany({ where: { accountId: identity.id }, orderBy: { sessionId: 'asc' } });
    for (const { sessionId } of memberships) {
      await lockSession(tx, sessionId);
      await closeSession(tx, sessionId);
      await tx.review.deleteMany({ where: { sessionId } });
    }
    await tx.invitation.deleteMany({ where: { email: identity.email } });
    await tx.account.delete({ where: { id: identity.id } });
    for (const { sessionId } of memberships) {
      await tx.session.deleteMany({ where: { id: sessionId, members: { none: {} } } });
    }
    return { ok: true };
  }));

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'الطلب غير متاح.' }); });
  if (buildDir) {
    app.use('/android', express.static(buildDir));
    app.use(express.static(buildDir));
  }
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof z.ZodError || error.status === 400 || error.status === 413) {
      res.status(error.status === 413 ? 413 : 400).json({ error: 'راجع الحقول وحجم النص ثم حاول مجددًا.' });
      return;
    }
    console.error('Mawadda request failed', error.code ?? error.name);
    res.status(500).json({ error: 'تعذّر إكمال الطلب. حاول مجددًا.' });
  };
  app.use(onError);
  return app;
}
