import { useCallback, useEffect, useRef, useState } from 'react';
import { currencies, currencyName, personalLimits, profileLabels, profileFieldLabel, profileOptions, skinTones,
  type PersonalDetails, type ProfileValue, type SessionProfile, type SharedProfileKey } from './personalProfile';
import type { ProfileApi } from './androidProfiles';

type ChoiceKey = keyof typeof profileOptions;

export function readPersonalDetails(fields: FormData): PersonalDetails {
  const text = (name: string) => String(fields.get(name) ?? '').trim() || undefined;
  const number = (name: string) => {
    const value = text(name);
    return value === undefined ? undefined : Number(value);
  };
  const choice = <Key extends ChoiceKey>(name: Key) => text(name) as PersonalDetails[Key];
  const age = number('age');
  const weightMode = text('weightMode');
  const currency = text('incomeCurrency');
  return {
    age, ageView: age === undefined ? undefined : text('ageView') === 'exact' ? 'exact' : 'range',
    heightCm: number('heightCm'),
    weight: weightMode === 'exact' ? { mode: 'exact', kg: number('weightKg')! }
      : weightMode === 'range' ? { mode: 'range', min: number('weightMin')!, max: number('weightMax')! } : undefined,
    skinTone: text('skinTone') === 'custom' ? text('skinToneCustom') : text('skinTone'),
    eyeColor: choice('eyeColor'), hairColor: choice('hairColor'),
    socialStatus: choice('socialStatus'), children: number('children'), education: choice('education'),
    jobStatus: choice('jobStatus'), jobField: text('jobField'), housing: choice('housing'),
    income: currency ? { currency, min: number('incomeMin')!, max: number('incomeMax')! } : undefined,
    incomeStability: choice('incomeStability'), commitments: choice('commitments'),
  };
}

function NumberField({ label, name, value, limits, step = '1', required = false }: {
  label: string; name: string; value?: number; limits: { min: number; max: number }; step?: string; required?: boolean;
}) {
  return <label>{label}<input type="number" name={name} defaultValue={value} min={limits.min} max={limits.max}
    step={step} required={required} placeholder={required ? undefined : 'اختياري'} /></label>;
}

function ProfileChoice({ name, value }: { name: ChoiceKey; value?: string }) {
  return <label>{profileLabels[name]}<select name={name} defaultValue={value ?? ''}>
    <option value="">أفضل عدم الإفصاح</option>
    {profileOptions[name].map(option => <option key={option}>{option}</option>)}
  </select></label>;
}

export function PersonalFields({ details }: { details: PersonalDetails }) {
  const [weightMode, setWeightMode] = useState(details.weight?.mode ?? '');
  const [skinTone, setSkinTone] = useState(details.skinTone && !skinTones.some(tone => tone === details.skinTone)
    ? 'custom' : details.skinTone ?? '');
  const [showIncome, setShowIncome] = useState(Boolean(details.income));
  const currencyChoices = details.income && !currencies.includes(details.income.currency)
    ? [...currencies, details.income.currency] : currencies;

  return <>
    <fieldset className="personal-group">
      <legend>معلومات شخصية</legend>
      <div className="personal-fields">
        <NumberField label="العمر بالسنوات" name="age" value={details.age} limits={personalLimits.age} />
        <label>طريقة عرض العمر عند المشاركة<select name="ageView" defaultValue={details.ageView ?? 'range'}>
          <option value="range">فئة عمرية</option><option value="exact">العمر بالسنوات</option>
        </select></label>
        <ProfileChoice name="socialStatus" value={details.socialStatus} />
        <NumberField label="عدد الأبناء" name="children" value={details.children} limits={personalLimits.children} />
        <ProfileChoice name="education" value={details.education} />
        <ProfileChoice name="jobStatus" value={details.jobStatus} />
        <label>مجال العمل<input name="jobField" defaultValue={details.jobField} maxLength={80} placeholder="اختياري" /></label>
        <ProfileChoice name="housing" value={details.housing} />
      </div>
    </fieldset>
    <fieldset className="personal-group">
      <legend>المظهر</legend>
      <div className="personal-fields">
        <NumberField label="الطول (سم)" name="heightCm" value={details.heightCm} limits={personalLimits.height} step="0.1" />
        <label>الوزن (كغ)<select name="weightMode" value={weightMode} onChange={event => setWeightMode(event.target.value as typeof weightMode)}>
          <option value="">أفضل عدم الإفصاح</option><option value="exact">رقم</option><option value="range">نطاق</option>
        </select></label>
        {weightMode === 'exact' && <NumberField label="الوزن بالرقم (كغ)" name="weightKg" value={details.weight?.mode === 'exact' ? details.weight.kg : undefined} limits={personalLimits.weight} step="0.1" required />}
        {weightMode === 'range' && <>
          <NumberField label="الوزن من (كغ)" name="weightMin" value={details.weight?.mode === 'range' ? details.weight.min : undefined} limits={personalLimits.weight} step="0.1" required />
          <NumberField label="الوزن إلى (كغ)" name="weightMax" value={details.weight?.mode === 'range' ? details.weight.max : undefined} limits={personalLimits.weight} step="0.1" required />
        </>}
        <label>لون البشرة<select name="skinTone" value={skinTone} onChange={event => setSkinTone(event.target.value)}>
          <option value="">أفضل عدم الإفصاح</option>{skinTones.map(tone => <option key={tone}>{tone}</option>)}
          <option value="custom">أكتب وصفًا بنفسي</option>
        </select></label>
        {skinTone === 'custom' && <label>وصف لون البشرة<input name="skinToneCustom" maxLength={60} defaultValue={details.skinTone} required /></label>}
        <ProfileChoice name="eyeColor" value={details.eyeColor} />
        <ProfileChoice name="hairColor" value={details.hairColor} />
      </div>
    </fieldset>
    <fieldset className="personal-group">
      <legend>الوضع المالي</legend>
      <div className="personal-fields">
        <label>نطاق الدخل الشهري<select value={showIncome ? 'range' : ''} onChange={event => setShowIncome(Boolean(event.target.value))}>
          <option value="">أفضل مناقشته لاحقًا</option><option value="range">إدخال نطاق</option>
        </select></label>
        {showIncome && <>
          <label>العملة<select name="incomeCurrency" required defaultValue={details.income?.currency ?? ''}>
            <option value="">اختر العملة</option>
            {currencyChoices.map(code => <option key={code} value={code}>{currencyName(code)} ({code})</option>)}
          </select></label>
          <NumberField label="الدخل من" name="incomeMin" value={details.income?.min} limits={personalLimits.income} step="0.01" required />
          <NumberField label="الدخل إلى" name="incomeMax" value={details.income?.max} limits={personalLimits.income} step="0.01" required />
        </>}
        <ProfileChoice name="incomeStability" value={details.incomeStability} />
        <ProfileChoice name="commitments" value={details.commitments} />
      </div>
    </fieldset>
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
    const timer = window.setInterval(refreshWhenVisible, 5000);
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
