import type { PersonalDetails } from './personalProfile';
import type { CustomField, CustomValues } from './adminTypes';

export type Question = { id: number; category: number; text: string; options: string[] | null; auto: boolean };
export const manualOnlyQuestionIds = new Set([73, 113]);
export type Questionnaire = { categories: string[]; questions: Question[] };

export type DraftAnswer = { choice: string; text: string; importance: number; deferred: boolean; revision: number };
export type ReviewStatus = 'agree' | 'partial' | 'different';
export type Discussion = { status: ReviewStatus; note: string; revision: number; mine: boolean; partner: boolean };
export type QuestionView = Question & { answer: DraftAnswer; partner?: DraftAnswer; review?: Discussion };

export type SessionSummary = {
  id: string;
  title: string;
  alias: string;
  partnerAlias: string | null;
  closed: boolean;
};

export type SessionView = SessionSummary & {
  category: number;
  categories: string[];
  categoryProgress?: { completed: number; total: number }[];
  canInvite: boolean;
  canShare: boolean;
  mineShared: boolean;
  partnerShared: boolean;
  comparisonOpen: boolean;
  fingerprint: string;
  completed: number;
  questions: QuestionView[];
  report: { scored: number; paired: number; approved: number; score: number | null } | null;
};

export type Config = { demo: true } | { demo: false; authUrl: string; authKey: string };
export const engagementLabels = {
  undisclosed: 'أفضل عدم الإفصاح', not_engaged: 'غير مرتبط', fiance: 'خاطب', fiancee: 'مخطوبة',
} as const;
export type Engagement = keyof typeof engagementLabels;
export type CountryOption = { code: string; name: string };
export type CityOption = { id: string; name: string; region: string };
type ProfileBasics = { displayName: string; engagement: Engagement; profileRevision: number };
export type ProfileFields = ProfileBasics & ({ city: string } | { location?: { countryCode: string; cityId: string | null }; personalDetails?: PersonalDetails;
  customValues?: Record<string, string | number | null>; customFieldsVersion?: string });
export type AccountProfile = ProfileBasics & {
  id: string; email: string | null; role: 'admin' | 'user'; city: string;
  countryCode?: string; countryName?: string; cityId?: string | null;
  personalDetails?: PersonalDetails;
  customFields?: CustomField[];
  customValues?: CustomValues;
  customFieldsVersion?: string;
  hasContentAdmin?: boolean;
};
export const demoAdminEmail = 'admin@example.test';
export const demoOwnerEmail = 'owner@example.test';
export const demoPeople = [
  { email: 'rana@example.test', name: 'رنا' },
  { email: 'omar@example.test', name: 'عمر' },
  { email: 'nour@example.test', name: 'نور' },
];

export function isAnswered(answer: DraftAnswer) {
  return !answer.deferred && Boolean(answer.choice || answer.text.trim());
}
