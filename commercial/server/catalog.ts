import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { Questionnaire } from '../src/types';
import type { PrismaClient } from './generated/client';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function ensureQuestionnaire(db: PrismaClient) {
  // This script is the repository's trusted question catalog. User data never enters this VM.
  const source = readFileSync(new URL('../../dist/questions.js', import.meta.url), 'utf8');
  const json = runInNewContext(`${source}\nJSON.stringify({ categories, questions })`, {}, { timeout: 1000 });
  const content = JSON.parse(json) as Questionnaire;
  if (content.categories.length !== 15 || content.questions.length !== 150 ||
      content.questions.some((question, index) => question.id !== index + 1 || question.category !== Math.floor(index / 10))) {
    throw new Error('Invalid questionnaire catalog');
  }
  const id = digest(json);
  await db.questionnaire.createMany({ data: [{ id, content }], skipDuplicates: true });
  await db.contentState.createMany({ data: [{ id: 'main', publishedId: id, draft: { questionnaire: content, fields: [] } }], skipDuplicates: true });
  return id;
}
