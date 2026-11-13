import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { demoAdminEmail, demoOwnerEmail, demoPeople, type AccountProfile, type CityOption, type CountryOption, type SessionView } from '../src/types';
import { ageFromBirthDate, latestBirthDate, type SessionProfile } from '../src/personalProfile';
import type { AdminStats, ContentView } from '../src/adminTypes';
import { createApp } from './app';
import { ensureQuestionnaire } from './catalog';
import { connectDatabase } from './database';
import { categoryQuota, categoryWindow } from './rateLimits';

test('age changes on the birthday and handles leap-day dates', () => {
  assert.equal(ageFromBirthDate('2008-02-29', new Date('2026-02-28T12:00:00Z')), 17);
  assert.equal(ageFromBirthDate('2008-02-29', new Date('2026-03-01T12:00:00Z')), 18);
  assert.equal(latestBirthDate(new Date('2028-02-29T12:00:00Z')), '2010-02-28');
});

test('two-party pilot keeps answers private and enforces versioned consent and review', async t => {
  // This in-memory demo uses synthetic accounts, profiles, and questionnaire answers.
  const connection = await connectDatabase();
  const questionnaire = await ensureQuestionnaire(connection.db);
  const catalog = await connection.db.questionnaire.findUniqueOrThrow({ where: { id: questionnaire } });
  assert.equal((catalog.content as { questions: unknown[] }).questions.length, 150);
  const ownerPassword = randomUUID();
  let now = Date.now();
  const server = createApp(connection.db, questionnaire, { demo: true }, undefined, undefined, [], [], ownerPassword,
    { now: () => now }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await connection.close();
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  async function call<T>(path: string, token = '', method = 'GET', body?: unknown, expected: number | number[] = 200): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    assert.ok([expected].flat().includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return value as T;
  }

  const [one, two, stranger] = await Promise.all(demoPeople.map(async person =>
    (await call<{ token: string }>('/dev/sign-in', '', 'POST', { email: person.email })).token));

  const signup = { email: 'android-profile@example.test', password: randomUUID(), register: true };
  const registered = (await call<{ token: string }>('/dev/password', '', 'POST', signup)).token;
  await call('/dev/password', '', 'POST', { ...signup, email: demoAdminEmail }, 409);
  await call('/dev/password', '', 'POST', signup, 409);
  const account = await call<AccountProfile>('/account', registered);
  assert.equal(account.role, 'user');
  const fields = { displayName: 'ملف أندرويد تجريبي', city: 'دبي', engagement: 'fiancee', profileRevision: 0 };
  await call('/account', registered, 'PUT', { ...fields, role: 'admin' }, 400);
  await call('/admin/users', '', 'GET', undefined, 401);
  await call('/admin/users', registered, 'GET', undefined, 403);
  await call(`/admin/users/${encodeURIComponent(account.id)}`, stranger, 'PUT', fields, 403);
  const changed = await call<AccountProfile>('/account', registered, 'PUT', fields);
  assert.equal(changed.engagement, 'fiancee');
  const admin = (await call<{ token: string }>('/dev/sign-in', '', 'POST', { email: demoAdminEmail })).token;
  assert.equal((await call<AccountProfile>('/account', admin)).role, 'admin');
  const found = await call<{ users: AccountProfile[] }>('/admin/users?q=android-profile', admin);
  const { personalDetails: emptyDetails, ...listProfile } = changed;
  assert.deepEqual(emptyDetails, {});
  assert.deepEqual(found.users, [listProfile]);
  const updated = await call<AccountProfile>(`/admin/users/${encodeURIComponent(account.id)}`, admin, 'PUT', {
    ...fields, engagement: 'fiance', profileRevision: changed.profileRevision,
  });
  await call('/account', registered, 'PUT', { ...fields, profileRevision: changed.profileRevision }, 409);
  await call('/dev/sign-out', registered, 'POST');
  const reentered = (await call<{ token: string }>('/dev/password', '', 'POST', { ...signup, register: false })).token;
  assert.deepEqual(await call<AccountProfile>('/account', reentered), { ...updated, personalDetails: {} });

  const countries = await call<CountryOption[]>('/locations/countries');
  assert.ok(countries.some(country => country.code === 'AE' && country.name.includes('الإمارات')));
  const dubai = (await call<CityOption[]>('/locations/cities?country=AE&q=Dubai'))[0];
  assert.equal(dubai.name, 'دبي');
  assert.ok((await call<CityOption[]>('/locations/cities?country=AE&q=%D8%AF%D8%A8%D9%8A')).some(city => city.id === dubai.id));
  const profileEdit = { displayName: updated.displayName, engagement: updated.engagement, profileRevision: updated.profileRevision };
  const kept = await call<AccountProfile>('/account', reentered, 'PUT', profileEdit);
  assert.equal(kept.city, 'دبي');
  await call('/account', reentered, 'PUT', { ...profileEdit, profileRevision: kept.profileRevision,
    location: { countryCode: 'SA', cityId: dubai.id } }, 400);
  const location = { countryCode: 'AE', cityId: dubai.id };
  const located = await call<AccountProfile>('/account', reentered, 'PUT', { ...profileEdit, profileRevision: kept.profileRevision, location });
  assert.equal(located.cityId, dubai.id);
  assert.equal(located.countryCode, 'AE');
  assert.equal((await call<AccountProfile>('/account', reentered)).city, 'دبي');
  const adminEdited = await call<AccountProfile>(`/admin/users/${encodeURIComponent(account.id)}`, admin, 'PUT', {
    ...profileEdit, profileRevision: located.profileRevision, location: { countryCode: 'SA', cityId: null },
  });
  assert.equal(adminEdited.countryCode, 'SA');
  assert.equal(adminEdited.city, '');

  const { id } = await call<{ id: string }>('/sessions', one, 'POST', { alias: 'طرف تجريبي أول' });
  const base = `/sessions/${id}`;
  const profileShare = `${base}/profile-share`;
  const view = (token: string, category = 0) => call<SessionView>(`${base}?category=${category}`, token);
  await call(base, '', 'GET', undefined, 401);
  await call(base, stranger, 'GET', undefined, 404);
  await call(base, admin, 'GET', undefined, 404);

  const firstAccount = await call<AccountProfile>('/account', one);
  const personalEdit = { displayName: 'ملف خاص للتجربة', engagement: 'fiance', profileRevision: firstAccount.profileRevision };
  const personalDetails = {
    age: 27, heightCm: 172, weight: { mode: 'range', min: 70, max: 79 }, skinTone: 'قمحية', eyeColor: 'أزرق',
    income: { currency: 'AED', min: 8000, max: 10000 },
  };
  await call('/account', one, 'PUT', { ...personalEdit, personalDetails: { ...personalDetails, income: { currency: 'AED', min: 10, max: 5 } } }, 400);
  const withDetails = await call<AccountProfile>('/account', one, 'PUT', { ...personalEdit, personalDetails });
  assert.deepEqual(withDetails.personalDetails, personalDetails);
  const shareAge = { profileRevision: withDetails.profileRevision, fields: ['age'] };
  await call(profileShare, one, 'PUT', shareAge, 409);
  await call(profileShare, admin, 'GET', undefined, 404);
  assert.equal((await call<{ users: AccountProfile[] }>('/admin/users?q=rana', admin)).users[0].personalDetails, undefined);
  await call(`/admin/users/${encodeURIComponent(firstAccount.id)}`, admin, 'PUT', { ...personalEdit,
    profileRevision: withDetails.profileRevision, personalDetails }, 400);

  const invite = (await call<{ code: string }>(base + '/invite', one, 'POST', { email: demoPeople[1].email })).code;
  const acceptance = { code: invite, alias: 'طرف تجريبي ثانٍ' };
  await call('/invitations/accept', stranger, 'POST', acceptance, 404);
  const acceptanceResults = await Promise.all([one, two].map(() => call<{ id?: string }>('/invitations/accept', two, 'POST', acceptance, [200, 404])));
  assert.deepEqual(acceptanceResults.filter(result => result.id), [{ id }]);
  await call(base + '/invite', one, 'POST', { email: demoPeople[2].email }, 409);

  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, []);
  await call(profileShare, one, 'PUT', { ...shareAge, fields: ['email'] }, 400);
  await call(profileShare, one, 'PUT', shareAge);
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, [{ key: 'age', value: '25–29 سنة' }]);
  await call(profileShare, stranger, 'GET', undefined, 404);
  const { age, ...otherDetails } = personalDetails;
  const birthDate = `${new Date().getUTCFullYear() - age}-01-01`;
  for (const invalid of ['2024-02-30', new Date().toISOString().slice(0, 10)]) {
    await call('/account', one, 'PUT', { ...personalEdit, profileRevision: withDetails.profileRevision,
      personalDetails: { ...otherDetails, birthDate: invalid } }, 400);
  }
  await call('/account', one, 'PUT', { ...personalEdit, profileRevision: withDetails.profileRevision,
    personalDetails: { ...otherDetails, gender: 'invalid' } }, 400);
  const updatedDetails = { ...otherDetails, birthDate, ageView: 'exact', gender: 'male', eyeColor: 'كهرماني', skinTone: 'زيتونية فاتحة' };
  const newDetails = await call<AccountProfile>('/account', one, 'PUT', {
    ...personalEdit, profileRevision: withDetails.profileRevision, personalDetails: updatedDetails,
  });
  assert.deepEqual(newDetails.personalDetails, updatedDetails);
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, []);
  await call(profileShare, one, 'PUT', shareAge, 409);
  await call(profileShare, one, 'PUT', { profileRevision: newDetails.profileRevision, fields: ['birthDate'] }, 400);
  await call(profileShare, one, 'PUT', { profileRevision: newDetails.profileRevision, fields: ['gender'] }, 400);
  await call(profileShare, one, 'PUT', { ...shareAge, profileRevision: newDetails.profileRevision });
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, [{ key: 'age', value: '27 سنة' }]);
  await call(profileShare, one, 'PUT', { ...shareAge, fields: [] });
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, []);

  const before = await view(one);
  assert.equal(before.questions.length, 10);
  assert.equal(before.categories.length, 15);
  for (let category = 1; category < categoryQuota; category++) await view(one, category);
  const limited = await fetch(`${origin}${base}?category=${categoryQuota}`, { headers: { Authorization: `Bearer ${one}` } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), String(categoryWindow / 1000));
  assert.equal('questions' in await limited.json(), false);
  await view(one);
  await view(two, categoryQuota);
  const otherSession = await call<{ id: string }>('/sessions', one, 'POST', { alias: 'جلسة لفحص حصة المحاور' });
  await call(`/sessions/${otherSession.id}?category=${categoryQuota}`, one, 'GET', undefined, 429);
  await call(`/sessions/${otherSession.id}?category=0`, one);
  now += categoryWindow;
  await view(one, categoryQuota);
  now += categoryWindow;
  const allQuestions = [];
  for (const category of before.categories.keys()) {
    if (category && category % categoryQuota === 0) now += categoryWindow;
    const selected = await view(one, category);
    assert.equal(selected.category, category);
    assert.equal(selected.title, before.categories[category]);
    allQuestions.push(...selected.questions.map(question => question.id));
  }
  assert.deepEqual(allQuestions, Array.from({ length: 150 }, (_, index) => index + 1));
  await call(`${base}?category=15`, one, 'GET', undefined, 400);
  const draft = { choice: '', text: 'نص اختبار للطرف الأول', importance: 3, deferred: false, revision: 0 };
  await call(base + '/answers/1', one, 'PUT', { ...draft, choice: 'نعم' }, 400);
  await call(base + '/answers/151', one, 'PUT', draft, 400);
  await call(base + '/answers/1', one, 'PUT', draft);
  await call(base + '/answers/1', one, 'PUT', draft, 409);
  await call(base + '/answers/1', two, 'PUT', { ...draft, text: 'نص اختبار للطرف الثاني' });
  await call(base + '/answers/2', two, 'PUT', { ...draft, text: 'مسودة مؤجلة خاصة', deferred: true });
  assert.equal((await view(two)).questions[0].partner, undefined);
  await call(base + '/consent', one, 'PUT', { share: true, fingerprint: before.fingerprint }, 409);

  const share = async (token: string, category = 0) => call(base + '/consent', token, 'PUT', { category, share: true, fingerprint: (await view(token, category)).fingerprint });
  await share(one);
  assert.equal((await view(two)).report, null);
  await share(two);
  const compared = await view(one);
  assert.equal(compared.questions[0].partner?.text, 'نص اختبار للطرف الثاني');
  assert.equal(compared.questions[1].partner?.text, '');
  assert.deepEqual(compared.report, { paired: 1, scored: 0, approved: 0, score: null });
  await call(base, stranger, 'GET', undefined, 404);
  await call(base + '/consent', stranger, 'PUT', { share: false }, 404);

  await call(base + '/reviews/1', one, 'PUT', { status: 'partial', note: 'خطوة افتراضية', revision: 0 });
  const approval = base + '/reviews/1/approve';
  await call(approval, one, 'POST', { revision: 1 });
  assert.equal((await view(one)).report?.score, null);
  await call(approval, two, 'POST', { revision: 1 });
  assert.deepEqual((await view(two)).report, { paired: 1, scored: 1, approved: 1, score: 50 });

  await call(base + '/answers/11', one, 'PUT', { ...draft, text: 'إجابة في المحور الثاني' });
  const ownProgress = (await view(one)).categoryProgress;
  assert.equal(ownProgress?.length, 15);
  assert.deepEqual(ownProgress?.slice(0, 2), [{ completed: 1, total: 10 }, { completed: 1, total: 10 }]);
  assert.deepEqual((await view(two)).categoryProgress?.slice(0, 2), [{ completed: 1, total: 10 }, { completed: 0, total: 10 }]);
  await call(base + '/answers/11', two, 'PUT', { ...draft, text: 'إجابة الشريك في المحور الثاني' });
  assert.equal((await view(one)).report?.score, 50);
  assert.equal((await view(one, 1)).questions[0].partner, undefined);
  await call(base + '/reviews/11', one, 'PUT', { status: 'agree', note: '', revision: 0 }, 403);
  await call(base + '/consent', one, 'PUT', { category: 1, share: true, fingerprint: (await view(one)).fingerprint }, 409);
  await share(one, 1);
  await share(two, 1);
  assert.equal((await view(one, 1)).questions[0].partner?.text, 'إجابة الشريك في المحور الثاني');

  await call(base + '/answers/1', one, 'PUT', { ...draft, text: 'مسودة معدّلة', revision: 1 });
  const paused = await view(two);
  assert.equal(paused.questions[0].partner, undefined);
  assert.equal(paused.questions[0].review, undefined);
  assert.equal(paused.report, null);
  assert.equal((await view(two, 1)).comparisonOpen, true);
  await share(one);
  const newView = await view(two);
  assert.equal(newView.questions[0].review?.note, 'خطوة افتراضية');
  assert.equal(newView.questions[0].review?.mine, false);
  assert.equal(newView.questions[0].review?.partner, false);
  await call(approval, two, 'POST', { revision: 1 }, 409);
  await call(base + '/consent', two, 'PUT', { share: false });
  assert.equal((await view(one)).questions[0].partner, undefined);
  assert.equal((await view(one)).report, null);
  assert.equal((await view(one, 1)).comparisonOpen, true);

  const stats = await call<AdminStats>('/admin/dashboard', admin);
  assert.equal(stats.comparisons, 1);
  assert.equal(stats.joined, 1);
  assert.equal(stats.categories[0].started, 1);
  await call('/admin/dashboard', stranger, 'GET', undefined, 403);
  await call('/dev/sign-in', '', 'POST', { email: demoOwnerEmail }, 400);
  await call('/dev/password', '', 'POST', { email: demoOwnerEmail, password: ownerPassword, register: true }, 409);
  const owner = (await call<{ token: string }>('/dev/password', '', 'POST', {
    email: demoOwnerEmail, password: ownerPassword, register: false,
  })).token;
  const content = await call<ContentView>('/admin/content', admin);
  assert.equal(content.canPublish, false);
  assert.equal((await call<ContentView>('/admin/content', owner)).canPublish, true);
  const fieldId = 'a01c00a4-e914-4bb6-9468-17b02bd21158';
  const edited = structuredClone(content.draft);
  edited.questionnaire.questions = edited.questionnaire.questions.filter(question => question.id !== 1);
  edited.questionnaire.questions.push({ id: 151, category: 0, text: 'سؤال تجريبي للإصدار الجديد؟', options: null, auto: false });
  edited.fields.push({ id: fieldId, label: 'حقل تجريبي', kind: 'choice', options: ['أول', 'ثاني'] });
  const saved = await call<ContentView>('/admin/content', admin, 'PUT', { revision: content.revision, draft: edited });
  assert.equal(saved.events[0].action, 'archive_question');
  await call('/admin/content/publish', admin, 'POST', { revision: saved.revision }, 403);
  await call('/admin/content/publish', owner, 'POST', { revision: content.revision }, 409);
  const published = await call<ContentView>('/admin/content/publish', owner, 'POST', { revision: saved.revision });
  assert.notEqual(published.publishedId, questionnaire);
  const future = await call<{ id: string }>('/sessions', one, 'POST', { alias: 'جلسة الإصدار الجديد' });
  const futureView = await call<SessionView>(`/sessions/${future.id}`, one);
  assert.ok(futureView.questions.some(question => question.id === 151));
  await call(`/sessions/${future.id}/answers/151`, one, 'PUT', draft);
  assert.equal((await view(one)).questions[0].id, 1);
  const beforeCustom = await call<AccountProfile>('/account', one);
  const customEdit = { displayName: beforeCustom.displayName, engagement: beforeCustom.engagement,
    profileRevision: beforeCustom.profileRevision, customFieldsVersion: beforeCustom.customFieldsVersion };
  await call('/account', one, 'PUT', { ...customEdit, customValues: { [fieldId]: 'خيار خارج القائمة' } }, 400);
  const customSaved = await call<AccountProfile>('/account', one, 'PUT', { ...customEdit, customValues: { [fieldId]: 'أول' } });
  assert.equal(customSaved.customValues?.[fieldId], 'أول');
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, []);
  await call(profileShare, one, 'PUT', { profileRevision: customSaved.profileRevision,
    fieldsVersion: customSaved.customFieldsVersion, fields: [`custom:${fieldId}`] });
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, [{ key: `custom:${fieldId}`, label: 'حقل تجريبي', value: 'أول' }]);
  const archived = await call<ContentView>('/admin/content', admin, 'PUT', {
    revision: published.revision, draft: { ...published.draft, fields: [] },
  });
  await call('/admin/content/publish', owner, 'POST', { revision: archived.revision });
  assert.deepEqual((await call<SessionProfile>(profileShare, two)).partner, []);

  await call('/me', two, 'DELETE');
  await call(base, two, 'GET', undefined, 404);
  assert.deepEqual((await call<{ sessions: unknown[] }>('/me', two)).sessions, []);
  const retained = await view(one);
  assert.equal(retained.closed, true);
  assert.equal(retained.questions[0].answer.text, 'مسودة معدّلة');
  assert.equal(retained.report, null);
  assert.equal(await connection.db.answer.count({ where: { sessionId: id } }), 2);
  assert.equal(await connection.db.consent.count({ where: { sessionId: id } }), 0);
  assert.equal(await connection.db.review.count({ where: { sessionId: id } }), 0);

  now += 10 * 60_000;
  for (let attempt = 0; attempt < 5; attempt++) await call('/sessions', stranger, 'POST', { alias: 'جلسة لفحص حد الإنشاء' });
  await call('/sessions', stranger, 'POST', { alias: 'طلب فوق الحد' }, 429);
  await call('/sessions', one, 'POST', { alias: 'حساب آخر ضمن الحد' });
  for (let attempt = 0; attempt < 20; attempt++) {
    await call('/dev/sign-in', '', 'POST', { email: demoPeople[0].email });
  }
  const limitedLogin = await fetch(`${origin}/dev/sign-in`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.10', 'CF-Connecting-IP': '192.0.2.10',
  }, body: JSON.stringify({ email: demoPeople[1].email }) });
  assert.equal(limitedLogin.status, 429);
  assert.equal(limitedLogin.headers.get('retry-after'), '60');
  await call('/me', one);
});

test('the category migration preserves existing first-category consent', async () => {
  const db = await PGlite.create();
  try {
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    await db.exec(await readFile(new URL('20261111000000_first_pilot/migration.sql', migrations), 'utf8'));
    await db.exec(`
      INSERT INTO "Account" ("id") VALUES ('first'), ('second');
      INSERT INTO "Questionnaire" ("id", "content") VALUES ('v1', '{}');
      INSERT INTO "Session" ("id", "questionnaireId") VALUES ('session', 'v1');
      INSERT INTO "Member" ("sessionId", "accountId", "seat", "alias", "consent")
        VALUES ('session', 'first', 1, 'A', 'stored-fingerprint'), ('session', 'second', 2, 'B', NULL);
    `);
    await db.exec(await readFile(new URL('20261112000000_category_consent/migration.sql', migrations), 'utf8'));
    const consents = await db.query('SELECT "accountId", "category", "fingerprint" FROM "Consent"');
    assert.deepEqual(consents.rows, [{ accountId: 'first', category: 0, fingerprint: 'stored-fingerprint' }]);
  } finally {
    await db.close();
  }
});
