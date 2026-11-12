import type { Questionnaire } from '../src/types';
import { fingerprint } from './domain';
import type { PrismaClient } from './generated/client';

const people = [
  ['sara-demo', 'سارة التجريبية', 'AE', 'أبوظبي', 'fiancee'],
  ['karim-demo', 'كريم التجريبي', 'AE', 'دبي', 'fiance'],
  ['leila-demo', 'ليلى التجريبية', 'JO', 'عمّان', 'fiancee'],
  ['samir-demo', 'سمير التجريبي', 'JO', 'إربد', 'fiance'],
  ['maya-demo', 'مايا التجريبية', 'LB', 'بيروت', 'fiancee'],
  ['rami-demo', 'رامي التجريبي', 'LB', 'طرابلس', 'fiance'],
  ['hala-demo', 'هالة التجريبية', 'SA', 'جدة', 'not_engaged'],
  ['nabil-demo', 'نبيل التجريبي', 'EG', 'القاهرة', 'not_engaged'],
] as const;

export async function seedAdminDemo(db: PrismaClient, questionnaireId: string) {
  const { content } = await db.questionnaire.findUniqueOrThrow({ where: { id: questionnaireId } });
  const catalog = content as Questionnaire;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);
  await db.$transaction(async tx => {
    const users = people.map(([handle, displayName, countryCode, city, engagement], index) => ({
      id: `demo:${handle}@example.test`, email: `${handle}@example.test`, displayName, countryCode, city, engagement,
      createdAt: daysAgo(8 - index),
    }));
    await tx.account.createMany({ data: users, skipDuplicates: true });

    for (const [index, pair] of [[0, 1], [2, 3], [4, 5], [6]].entries()) {
      const opened = index === 0 || index === 1;
      const session = await tx.session.create({ data: { questionnaireId, createdAt: daysAgo(5 - index),
        firstComparisonAt: opened ? daysAgo(3 - index) : null,
        members: { create: pair.map((person, seat) => ({ accountId: users[person].id, alias: users[person].displayName, seat: seat + 1 })) },
      } });
      for (const person of pair) {
        const count = index === 0 ? 14 : index === 1 ? 7 : index === 2 ? 3 : 0;
        const answers = catalog.questions.slice(0, count).map(question => ({
          sessionId: session.id, accountId: users[person].id, questionId: question.id, choice: question.options?.[0] ?? '',
          text: question.options ? '' : 'إجابة افتراضية لعرض مؤشرات التجربة.', importance: 1, deferred: false, revision: 1,
        }));
        await tx.answer.createMany({ data: answers });
        if (opened) await tx.consent.create({ data: { sessionId: session.id, accountId: users[person].id, category: 0,
          fingerprint: fingerprint(answers.filter(answer => answer.questionId <= 10)),
        } });
      }
    }
  });
}
