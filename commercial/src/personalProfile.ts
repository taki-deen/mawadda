export const profileOptions = {
  socialStatus: ['غير متزوج/ة', 'متزوج/ة', 'مطلّق/ة', 'أرمل/ة'],
  education: ['ثانوي أو أقل', 'دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه'],
  jobStatus: ['موظف/ة', 'عمل حر', 'طالب/ة', 'باحث/ة عن عمل', 'متقاعد/ة', 'أخرى'],
  incomeStability: ['ثابت', 'متغيّر'],
  commitments: ['عندي التزامات شهرية', 'ما عندي التزامات شهرية', 'أفضل مناقشته لاحقًا'],
  housing: ['ملك', 'إيجار', 'مع الأهل', 'أخرى'],
  eyeColor: ['بنّي', 'عسلي', 'أخضر', 'أزرق', 'رمادي', 'أخرى'],
  hairColor: ['أسود', 'بنّي', 'أشقر', 'أحمر', 'رمادي', 'أبيض', 'أخرى'],
} as const;

export const skinTones = ['فاتحة', 'قمحية', 'سمراء', 'داكنة'] as const;

export const personalLimits = {
  age: { min: 18, max: 120 }, height: { min: 1, max: 300 }, weight: { min: 1, max: 700 },
  children: { min: 0, max: 30 }, income: { min: 0, max: 1000000000 },
} as const;

type Choices = { [Key in keyof typeof profileOptions]?: typeof profileOptions[Key][number] };
export type PersonalDetails = Choices & {
  age?: number; ageView?: 'exact' | 'range'; heightCm?: number;
  weight?: { mode: 'exact'; kg: number } | { mode: 'range'; min: number; max: number };
  skinTone?: string; children?: number; jobField?: string;
  income?: { currency: string; min: number; max: number };
};

export const profileLabels = {
  displayName: 'الاسم الظاهر', engagement: 'حالة الخطوبة', country: 'الدولة', city: 'المدينة',
  age: 'العمر', heightCm: 'الطول', weight: 'الوزن', skinTone: 'لون البشرة', eyeColor: 'لون العينين', hairColor: 'لون الشعر',
  socialStatus: 'الحالة الاجتماعية', children: 'عدد الأبناء', education: 'المستوى التعليمي', jobStatus: 'الحالة الوظيفية',
  jobField: 'مجال العمل', income: 'نطاق الدخل الشهري', incomeStability: 'استقرار الدخل', commitments: 'الالتزامات الشهرية', housing: 'السكن الحالي',
} as const;

type BuiltInProfileKey = keyof typeof profileLabels;
export type SharedProfileKey = BuiltInProfileKey | `custom:${string}`;
export const sharedProfileKeys = Object.keys(profileLabels) as BuiltInProfileKey[];
export type ProfileValue = { key: SharedProfileKey; value: string; label?: string };
export const profileFieldLabel = (item: ProfileValue) => item.label ?? profileLabels[item.key as BuiltInProfileKey];
export type SessionProfile = {
  canShare: boolean;
  profileRevision: number;
  fieldsVersion?: string;
  available: ProfileValue[];
  selected: SharedProfileKey[];
  partner: ProfileValue[];
};

const numberFormat = new Intl.NumberFormat('ar', { maximumFractionDigits: 2 });
const currencyNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['ar'], { type: 'currency' }) : null;
export const currencies = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : [
  'AED', 'BHD', 'DZD', 'EGP', 'EUR', 'GBP', 'IQD', 'JOD', 'KWD', 'LBP', 'MAD', 'OMR', 'QAR', 'SAR', 'SYP', 'TND', 'TRY', 'USD',
];

export function currencyName(code: string) {
  return currencyNames?.of(code) ?? code;
}

export function personalValues(details: PersonalDetails, sharing = false): ProfileValue[] {
  const { age, heightCm, weight, income } = details;
  let ageLabel = '';
  if (age !== undefined) {
    const base = Math.floor(age / 5) * 5;
    ageLabel = sharing && details.ageView !== 'exact'
      ? `${Math.max(base, personalLimits.age.min)}–${Math.min(base + 4, personalLimits.age.max)} سنة`
      : `${age} سنة`;
  }
  const weightLabel = weight?.mode === 'exact' ? `${weight.kg} كغ` : weight ? `${weight.min}–${weight.max} كغ` : '';
  const values: Partial<Record<BuiltInProfileKey, string>> = {
    ...details,
    age: ageLabel,
    heightCm: heightCm === undefined ? '' : `${heightCm} سم`,
    weight: weightLabel,
    children: details.children === undefined ? '' : String(details.children),
    income: income ? `${numberFormat.format(income.min)}–${numberFormat.format(income.max)} ${currencyName(income.currency)}` : '',
  };
  return sharedProfileKeys.flatMap(key => values[key] ? [{ key, value: values[key] }] : []);
}
