import { z } from 'zod';
import { currencies, earliestBirthDate, latestBirthDate, personalLimits, personalValues, profileOptions, type ProfileValue } from '../src/personalProfile';
import type { CustomField } from '../src/adminTypes';
import { visibleCustomValues } from './adminContent';
import { engagementLabels, type Engagement } from '../src/types';
import { countryName } from './locations';
import type { Prisma } from './generated/client';

const { age, height, weight, children, income } = personalLimits;
const weightNumber = z.number().min(weight.min).max(weight.max);
const incomeNumber = z.number().min(income.min).max(income.max);

export const personalDetailsSchema = z.strictObject({
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.iso.date().refine(value => value >= earliestBirthDate).optional(),
  age: z.number().int().min(age.min).max(age.max).optional(),
  ageView: z.enum(['exact', 'range']).optional(),
  heightCm: z.number().min(height.min).max(height.max).optional(),
  weight: z.union([
    z.strictObject({ mode: z.literal('exact'), kg: weightNumber }),
    z.strictObject({ mode: z.literal('range'), min: weightNumber, max: weightNumber }).refine(value => value.min <= value.max),
  ]).optional(),
  skinTone: z.string().trim().min(1).max(60).optional(),
  eyeColor: z.enum(profileOptions.eyeColor).optional(),
  hairColor: z.enum(profileOptions.hairColor).optional(),
  socialStatus: z.enum(profileOptions.socialStatus).optional(),
  children: z.number().int().min(children.min).max(children.max).optional(),
  education: z.enum(profileOptions.education).optional(),
  jobStatus: z.enum(profileOptions.jobStatus).optional(),
  jobField: z.string().trim().min(1).max(80).optional(),
  income: z.strictObject({ currency: z.string().refine(code => currencies.includes(code)), min: incomeNumber, max: incomeNumber })
    .refine(value => value.min <= value.max).optional(),
  incomeStability: z.enum(profileOptions.incomeStability).optional(),
  commitments: z.enum(profileOptions.commitments).optional(),
  housing: z.enum(profileOptions.housing).optional(),
}).refine(details => details.birthDate === undefined || details.age === undefined);

export const personalDetailsInputSchema = personalDetailsSchema.refine(details => !details.birthDate || details.birthDate <= latestBirthDate(), {
  path: ['birthDate'], message: 'العمر لازم يكون 18 سنة على الأقل.',
});

export const shareAccountFields = {
  displayName: true, engagement: true, countryCode: true, city: true, personalDetails: true, profileRevision: true, customProfile: true,
} satisfies Prisma.AccountSelect;

export function shareableValues(account: Prisma.AccountGetPayload<{ select: typeof shareAccountFields }>, fields: CustomField[]): ProfileValue[] {
  const { displayName, city, countryCode, engagement, personalDetails } = account;
  const basics = {
    displayName,
    country: countryCode ? countryName(countryCode) : '',
    city,
    engagement: engagement === 'undisclosed' ? '' : engagementLabels[engagement as Engagement],
  };
  const visible = (Object.keys(basics) as (keyof typeof basics)[]).flatMap(key => basics[key] ? [{ key, value: basics[key] }] : []);
  const customValues = visibleCustomValues(fields, account.customProfile);
  const custom = fields.flatMap(field => customValues[field.id] === undefined ? []
    : [{ key: `custom:${field.id}` as const, label: field.label, value: String(customValues[field.id]) }]);
  return [...visible, ...personalValues(personalDetailsSchema.parse(personalDetails), true), ...custom];
}
