import { useCallback, useEffect, useRef, useState } from 'react';
import { ageFromBirthDate, currencies, currencyName, earliestBirthDate, latestBirthDate, personalLimits, profileLabels, profileFieldLabel, profileOptions, profileGenderLabels,
  type PersonalDetails, type ProfileGender, type ProfileValue, type SessionProfile, type SharedProfileKey } from './personalProfile';
import type { ProfileApi } from './androidProfiles';
import { HeightField, WeightFields } from './profileMeasurements';
import { optionalChoices, ProfileChoices, ProfileLookup, ProfileNumberField, ProfileTextField } from './profileInputs';
import { AppearanceFields } from './profileAppearance';

type ChoiceKey = keyof typeof profileOptions;

export function readPersonalDetails(fields: FormData): PersonalDetails {
  const text = (name: string) => String(fields.get(name) ?? '').trim() || undefined;
  const number = (name: string) => {
    const value = text(name);
    return value === undefined ? undefined : Number(value);
  };
  const choice = <Key extends ChoiceKey>(name: Key) => text(name) as PersonalDetails[Key];
  const birthDate = text('birthDate');
  const age = birthDate ? undefined : number('age');
  const weightMode = text('weightMode');
  const weightKg = number('weightKg');
  const currency = text('incomeCurrency');
  const gender = text('gender');
  return {
    gender: gender === 'male' || gender === 'female' ? gender : undefined,
    birthDate, age, ageView: birthDate || age !== undefined ? (text('ageView') === 'exact' ? 'exact' : 'range') : undefined,
    heightCm: number('heightCm'),
    weight: weightMode === 'exact' && weightKg !== undefined ? { mode: 'exact', kg: weightKg }
      : weightMode === 'range' ? { mode: 'range', min: number('weightMin')!, max: number('weightMax')! } : undefined,
    skinTone: text('skinTone') === 'custom' ? text('skinToneCustom') : text('skinTone'),
    eyeColor: choice('eyeColor'), hairColor: choice('hairColor'),
    socialStatus: choice('socialStatus'), children: number('children'), education: choice('education'),
    jobStatus: choice('jobStatus'), jobField: text('jobField'), housing: choice('housing'),
    income: currency ? { currency, min: number('incomeMin')!, max: number('incomeMax')! } : undefined,
    incomeStability: choice('incomeStability'), commitments: choice('commitments'),
  };
}

function ProfileChoice({ name, value }: { name: ChoiceKey; value?: string }) {
  return <ProfileChoices name={name} label={profileLabels[name]} initialValue={value}
    options={optionalChoices(profileOptions[name])} />;
}

function AgeFields({ details }: { details: PersonalDetails }) {
  const [birthDate, setBirthDate] = useState(details.birthDate ?? '');
  const [keepSavedAge, setKeepSavedAge] = useState(true);
  const latest = latestBirthDate();
  const savedAge = keepSavedAge ? details.age : undefined;
  const validDate = birthDate >= earliestBirthDate && birthDate <= latest;
  const age = birthDate ? (validDate ? ageFromBirthDate(birthDate) : undefined) : savedAge;

  return <div className="profile-age">
    <label>تاريخ الميلاد (اختياري)
      <input type="date" name="birthDate" autoComplete="bday" dir="ltr" min={earliestBirthDate} max={latest}
        value={birthDate} onInput={event => setBirthDate(event.currentTarget.value)} onChange={event => setBirthDate(event.target.value)} />
    </label>
    <output className="profile-age-result" aria-live="polite">
      {age === undefined ? (birthDate ? 'اختَر تاريخ ميلاد صالحًا لعمر 18 سنة فأكثر.' : 'العمر بيظهر هون بعد اختيار تاريخ الميلاد.')
        : `${birthDate ? 'عمرك' : 'عمرك المحفوظ'} ${age} سنة`}
    </output>
    {birthDate && <button type="button" className="plain" onClick={() => setBirthDate('')}>مسح تاريخ الميلاد</button>}
    {!birthDate && savedAge !== undefined && <>
      <input type="hidden" name="age" value={savedAge} />
      <button type="button" className="plain" onClick={() => setKeepSavedAge(false)}>مسح العمر المحفوظ</button>
    </>}
    <ProfileChoices label="طريقة عرض العمر عند المشاركة" name="ageView" initialValue={details.ageView ?? 'range'} options={[
      { value: 'range', label: 'فئة عمرية' }, { value: 'exact', label: 'العمر بالسنوات' },
    ]} />
    <p className="muted small">تاريخ الميلاد بيظهر إلك وحدك.</p>
  </div>;
}

function IncomeFields({ income }: { income: PersonalDetails['income'] }) {
  const [mode, setMode] = useState(income ? 'range' : '');
  const [currency, setCurrency] = useState(income?.currency ?? '');
  const codes = income && !currencies.includes(income.currency) ? [...currencies, income.currency] : currencies;
  return <>
    <ProfileChoices name="incomeMode" label="نطاق الدخل الشهري" value={mode} onChange={setMode} options={[
      { value: 'range', label: 'إدخال نطاق' }, { value: '', label: 'أفضل مناقشته لاحقًا' },
    ]} />
    <fieldset className="profile-income-range" hidden={!mode} disabled={!mode}>
      <ProfileLookup name="incomeCurrency" label="العملة" searchLabel="بحث عن عملة" placeholder="اسم العملة أو رمزها" emptyLabel="اختر العملة"
        value={currency} options={codes.map(code => ({ value: code, label: `${currencyName(code)} (${code})` }))} onSelect={setCurrency} required />
      <ProfileNumberField label="الدخل من" name="incomeMin" value={income?.min} {...personalLimits.income} increment={100} required />
      <ProfileNumberField label="الدخل إلى" name="incomeMax" value={income?.max} {...personalLimits.income} increment={100} required />
    </fieldset>
  </>;
}

export function PersonalFields({ details }: { details: PersonalDetails }) {
  const [gender, setGender] = useState<ProfileGender | ''>(details.gender ?? '');

  return <>
    <details className="profile-section">
      <summary>معلومات شخصية</summary>
      <div className="personal-fields">
        <AgeFields details={details} />
        <ProfileChoice name="socialStatus" value={details.socialStatus} />
        <ProfileNumberField label="عدد الأبناء" name="children" value={details.children} {...personalLimits.children} integer />
        <ProfileChoice name="education" value={details.education} />
        <ProfileChoice name="jobStatus" value={details.jobStatus} />
        <ProfileTextField label="مجال العمل" name="jobField" value={details.jobField} maxLength={80} />
        <ProfileChoice name="housing" value={details.housing} />
      </div>
    </details>
    <details className="profile-section">
      <summary>المظهر</summary>
      <div className="personal-fields">
        <ProfileChoices label="الجنس" name="gender" value={gender} onChange={value => setGender(value as ProfileGender | '')} options={[
          ...Object.entries(profileGenderLabels).map(([value, label]) => ({ value, label })), { value: '', label: 'بدون اختيار' },
        ]} />
        <div className="profile-measurements">
          <HeightField value={details.heightCm} gender={gender} />
          <WeightFields weight={details.weight} />
        </div>
        <AppearanceFields details={details} gender={gender} />
      </div>
    </details>
    <details className="profile-section">
      <summary>الوضع المالي</summary>
      <div className="personal-fields">
        <IncomeFields income={details.income} />
        <ProfileChoice name="incomeStability" value={details.incomeStability} />
        <ProfileChoice name="commitments" value={details.commitments} />
      </div>
    </details>
  </>;
}

export function ProfileValues({ values }: { values: ProfileValue[] }) {
  return <dl className="profile-values">{values.map(item => <div key={item.key}>
    <dt>{profileFieldLabel(item)}</dt><dd dir="auto">{item.value}</dd>
  </div>)}</dl>;
}

export function SessionProfilePanel({ path, api, busy, run, onMessage }: {
  path: string; api: ProfileApi; busy: boolean; run: (work: () => Promise<void>) => void; onMessage: (message: string) => void;
}) {
  const [data, setData] = useState<SessionProfile>();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ revision: number; fieldsVersion?: string; keys: SharedProfileKey[] }>();
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await api<SessionProfile>(path);
      if (request === sequence.current) { setData(result); setError(''); }
    } catch (error) {
      if (request === sequence.current) {
        setData(undefined);
        setError(error instanceof Error ? error.message : 'تعذّر تحميل الملف المشترك.');
      }
    }
  }, [api, path]);

  useEffect(() => {
    const refreshWhenVisible = () => { if (!document.hidden && !busy) void refresh(); };
    refreshWhenVisible();
    const timer = window.setInterval(refreshWhenVisible, 15_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      ++sequence.current;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh, busy]);

  if (!data) return <section className="card"><p role={error ? 'alert' : 'status'}>{error || 'جارٍ تحميل الملف المشترك…'}</p></section>;
  const selected = draft?.revision === data.profileRevision && draft.fieldsVersion === data.fieldsVersion ? draft.keys : data.selected;
  const preview = data.available.filter(item => selected.includes(item.key));
  const changed = selected.length !== data.selected.length || selected.some(key => !data.selected.includes(key));
  const save = (keys: SharedProfileKey[]) => run(async () => {
    ++sequence.current;
    const result = await api<SessionProfile>(path, 'PUT', { profileRevision: data.profileRevision, fieldsVersion: data.fieldsVersion, fields: keys });
    setData(result);
    setDraft(undefined);
    onMessage(keys.length ? 'حُفظت مشاركة ملفك في هذه الجلسة.' : 'توقفت مشاركة ملفك في هذه الجلسة.');
  });

  return <div className="dashboard-grid">
    <section className="card"><h2>ما أشاركه مع الطرف الآخر</h2>
      {!data.canShare && <p className="muted">تظهر خيارات المشاركة بعد انضمام الطرف الآخر لجلسة مفتوحة.</p>}
      {data.canShare && data.available.length === 0 && <p className="muted">أضف معلومات إلى ملفك حتى تقدر تختار شو تشارك.</p>}
      {data.canShare && data.available.length > 0 && <>
        <fieldset disabled={busy} className="profile-share-options"><legend>اختَر الحقول لهذه الجلسة</legend>
          {data.available.map(item => <label className="checkbox" key={item.key}>
            <input type="checkbox" checked={selected.includes(item.key)} onChange={event => setDraft({ revision: data.profileRevision, fieldsVersion: data.fieldsVersion,
              keys: event.target.checked ? [...selected, item.key] : selected.filter(key => key !== item.key) })} />{profileFieldLabel(item)}
          </label>)}
        </fieldset>
        <h3>معاينة ملفي كما يراه الطرف الآخر بعد الحفظ</h3>
        {preview.length ? <ProfileValues values={preview} /> : <p className="muted">ما اخترت أي حقول للمشاركة.</p>}
        <div className="actions"><button type="button" className="button" disabled={busy || !changed} onClick={() => save(selected)}>حفظ المشاركة</button>
          {data.selected.length > 0 && <button type="button" className="button secondary" disabled={busy} onClick={() => save([])}>إيقاف المشاركة</button>}
        </div>
        <p className="muted small profile-share-note">بعد تعديل ملفك، راجع الحقول واحفظ مشاركتها مجددًا.</p>
      </>}
    </section>
    <section className="card"><h2>ما شاركه الطرف الآخر</h2>
      {data.partner.length ? <ProfileValues values={data.partner} /> : <p className="muted">ما في معلومات مشتركة حاليًا.</p>}
    </section>
  </div>;
}
