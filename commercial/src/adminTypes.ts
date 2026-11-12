import type { Questionnaire } from './types';

export type CustomField = { id: string; label: string; kind: 'text' | 'number' | 'choice'; options: string[] };
export type CustomValues = Record<string, string | number>;
export type ContentDraft = { questionnaire: Questionnaire; fields: CustomField[] };
export type ContentEvent = { actor: string; action: string; subject: string; createdAt: string };
export type ContentView = { revision: number; highestQuestionId: number; draft: ContentDraft; publishedId: string; canPublish: boolean; events: ContentEvent[] };
export type DashboardVersion = { id: string; number: number; createdAt: string };
export type AdminStats = {
  accounts: number; sessions: number; joined: number; comparisons: number;
  categories: { title: string; started: number; completed: number }[];
  versions: DashboardVersion[]; selectedVersion: string;
};
