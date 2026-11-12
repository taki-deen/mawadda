import { useEffect, useState } from 'react';
import { engagementLabels, type AccountProfile, type CityOption, type CountryOption, type Engagement, type ProfileFields } from './types';
import { personalValues } from './personalProfile';
import { PersonalFields, ProfileValues, readPersonalDetails } from './profileDetails';

export type ProfileApi = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Run = (work: () => Promise<void>) => void;

function ProfileForm({ profile, api, busy, onSave }: {
  profile: AccountProfile; api: ProfileApi; busy: boolean; onSave: (fields: ProfileFields) => void;
}) {
  const [location, setLocation] = useState<{ countryCode: string; cityId: string | null }>();
  const supportsLocations = profile.countryCode !== undefined;

  return <form onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const basics = { displayName: String(fields.get('displayName')),
      engagement: String(fields.get('engagement')) as Engagement, profileRevision: profile.profileRevision };
    const customValues = profile.customFields && Object.fromEntries(profile.customFields.map(field => {
      const value = String(fields.get(`custom:${field.id}`) ?? '').trim();
      return [field.id, value ? (field.kind === 'number' ? Number(value) : value) : null];
    }));
    onSave(supportsLocations ? { ...basics, location, personalDetails: profile.personalDetails && readPersonalDetails(fields),
      customValues, customFieldsVersion: profile.customFieldsVersion }
      : { ...basics, city: String(fields.get('city')) });
  }}>
    <fieldset disabled={busy}>
      <label>الاسم الظاهر<input name="displayName" autoComplete="nickname" required maxLength={60} defaultValue={profile.displayName} /></label>
      {supportsLocations ? <ProfileLocation profile={profile} api={api} onChange={setLocation} />
        : <label>المدينة (اختياري)<input name="city" autoComplete="address-level2" maxLength={80} defaultValue={profile.city} /></label>}
      <label>حالة الخطوبة<select name="engagement" defaultValue={profile.engagement}>
        {Object.entries(engagementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {profile.personalDetails && <PersonalFields details={profile.personalDetails} />}
      {Boolean(profile.customFields?.length) && <fieldset className="personal-group"><legend>حقول إضافية</legend>
        {profile.customFields?.map(field => <label key={field.id}>{field.label}
          {field.kind === 'choice' ? <select name={`custom:${field.id}`} defaultValue={profile.customValues?.[field.id] ?? ''}>
            <option value="">أفضل عدم الإفصاح</option>{field.options.map(option => <option key={option}>{option}</option>)}
          </select> : <input name={`custom:${field.id}`} type={field.kind} step={field.kind === 'number' ? 'any' : undefined} maxLength={250}
            placeholder="اختياري" defaultValue={profile.customValues?.[field.id]} />}
        </label>)}
      </fieldset>}
      <button className="button">حفظ الملف الشخصي</button>
    </fieldset>
  </form>;
}

function ProfileLocation({ profile, api, onChange }: {
  profile: AccountProfile; api: ProfileApi; onChange: (location: { countryCode: string; cityId: string | null }) => void;
}) {
  const [countries, setCountries] = useState<CountryOption[]>();
  const [countryError, setCountryError] = useState(false);
  const [country, setCountry] = useState(profile.countryCode ?? '');
  const [city, setCity] = useState<CityOption | null>(profile.cityId ? { id: profile.cityId, name: profile.city, region: '' } : null);
  const [searching, setSearching] = useState(!profile.cityId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ key: string; options: CityOption[] | null }>();
  const [showLegacy, setShowLegacy] = useState(Boolean(profile.city && !profile.cityId));
  const searchKey = `${country}:${query}`;

  useEffect(() => {
    let ignore = false;
    api<CountryOption[]>('/locations/countries').then(options => { if (!ignore) setCountries(options); })
      .catch(() => { if (!ignore) setCountryError(true); });
    return () => { ignore = true; };
  }, [api]);

  useEffect(() => {
    if (!country || !searching) return;
    let ignore = false;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ country, q: query });
      api<CityOption[]>(`/locations/cities?${params}`).then(options => { if (!ignore) setResults({ key: searchKey, options }); })
        .catch(() => { if (!ignore) setResults({ key: searchKey, options: null }); });
    }, query ? 180 : 0);
    return () => { ignore = true; window.clearTimeout(timeout); };
  }, [api, country, query, searchKey, searching]);

  const options = results?.key === searchKey ? results.options : undefined;

  return <div className="profile-location">
    <label>الدولة (اختياري)
      <select value={country} disabled={!countries} onChange={event => {
        const next = event.target.value;
        setCountry(next); setCity(null); setQuery(''); setResults(undefined); setSearching(true); setShowLegacy(false);
        onChange({ countryCode: next, cityId: null });
      }}>
        <option value="">{countries || countryError ? 'اختر الدولة' : 'جارٍ تحميل الدول…'}</option>
        {country && !countries?.some(item => item.code === country) && <option value={country}>{profile.countryName || country}</option>}
        {countries?.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </label>
    {countryError && <p className="muted small" role="status">تعذّر تحميل الدول. أعد فتح الملف للمحاولة.</p>}
    {showLegacy && <p className="muted small">المدينة المحفوظة {profile.city}. اختر الدولة لتحديثها من القائمة.</p>}
    {city && <div className="profile-city-selected">
      <span><small>المدينة</small><strong dir="auto">{city.name}</strong></span>
      <div className="actions">
        <button type="button" className="plain" aria-expanded={searching} onClick={() => setSearching(!searching)}>{searching ? 'إغلاق البحث' : 'تغيير المدينة'}</button>
        <button type="button" className="plain" onClick={() => { setCity(null); setSearching(true); onChange({ countryCode: country, cityId: null }); }}>مسح المدينة</button>
      </div>
    </div>}
    {country && searching && <div className="profile-city-picker">
      <label>ابحث عن مدينة (اختياري)<input type="search" maxLength={80} value={query} placeholder="اكتب اسم المدينة" onChange={event => setQuery(event.target.value)} /></label>
      {options === undefined && <p className="muted small" role="status">جارٍ تحميل المدن…</p>}
      {options === null && <p className="muted small" role="status">تعذّر تحميل المدن. غيّر البحث للمحاولة.</p>}
      {options?.length === 0 && <p className="muted small" role="status">ما في مدن مطابقة ضمن القائمة.</p>}
      {options && options.length > 0 && <ul className="profile-city-options" aria-label="خيارات المدينة">
        {options.map(option => <li key={option.id}><button type="button" onClick={() => {
          setCity(option); setSearching(false); setQuery(''); setShowLegacy(false);
          onChange({ countryCode: country, cityId: option.id });
        }}><span dir="auto">{option.name}</span>{option.region && <small dir="auto">{option.region}</small>}</button></li>)}
      </ul>}
    </div>}
  </div>;
}

export function MyAccount({ profile, api, busy, onSave }: {
  profile: AccountProfile; api: ProfileApi; busy: boolean; onSave: (fields: ProfileFields) => void;
}) {
  const extra = profile.personalDetails ? personalValues(profile.personalDetails) : [];
  return <div className="profile-layout">
    <section className="card account-summary">
      <h1>{profile.displayName || 'ملفي الشخصي'}</h1>
      <dl>
        <div><dt>حالة الخطوبة</dt><dd>{engagementLabels[profile.engagement]}</dd></div>
        {profile.countryName && <div><dt>الدولة</dt><dd>{profile.countryName}</dd></div>}
        {profile.city && <div><dt>المدينة</dt><dd>{profile.city}</dd></div>}
        <div><dt>البريد الإلكتروني</dt><dd dir="auto">{profile.email}</dd></div>
      </dl>
      {extra.length > 0 && <ProfileValues values={extra} />}
      {profile.customFields?.some(field => profile.customValues?.[field.id] !== undefined) && <ProfileValues values={profile.customFields.flatMap(field => {
        const value = profile.customValues?.[field.id];
        return value === undefined ? [] : [{ key: `custom:${field.id}` as const, label: field.label, value: String(value) }];
      })} />}
    </section>
    <section className="card"><h2>{profile.displayName ? 'تعديل ملفي' : 'أكمل ملفك الشخصي'}</h2>
      <ProfileForm key={profile.profileRevision} profile={profile} api={api} busy={busy} onSave={onSave} />
    </section>
  </div>;
}

type AccountPage = { users: AccountProfile[]; next: string | null };

export function AdminUsers({ api, busy, run, onSaved }: { api: ProfileApi; busy: boolean; run: Run; onSaved: (profile: AccountProfile) => void }) {
  const [query, setQuery] = useState({ name: '', after: '' });
  const [page, setPage] = useState<AccountPage>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.name) params.set('q', query.name);
    if (query.after) params.set('after', query.after);
    let ignore = false;
    api<AccountPage>(`/admin/users?${params}`).then(value => { if (!ignore) setPage(value); })
      .catch(error => { if (!ignore) setError(error instanceof Error ? error.message : 'تعذّر تحميل المستخدمين.'); });
    return () => { ignore = true; };
  }, [api, query]);

  const load = (name: string, after = '') => {
    setPage(undefined);
    setSelected(undefined);
    setError('');
    setQuery({ name, after });
  };

  return <section className="card admin-users">
    <h1>إدارة المستخدمين</h1>
    <form className="account-search" onSubmit={event => {
      event.preventDefault();
      load(String(new FormData(event.currentTarget).get('search')).trim());
    }}>
      <label>ابحث بالاسم أو البريد<input name="search" type="search" maxLength={80} /></label>
      <button className="button secondary" disabled={busy}>بحث</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!page && !error && <p role="status">جارٍ تحميل المستخدمين…</p>}
    {page?.users.length === 0 && <p className="muted">ما في مستخدمين مطابقين للبحث.</p>}
    {page && <ul className="admin-user-list">{page.users.map(user => <li key={user.id}>
      <div className="admin-user-line">
        <div><strong>{user.displayName || 'ملف بدون اسم'}</strong>
          <small dir="auto">{user.email || 'بانتظار تسجيل الدخول'}</small>
          {(user.city || user.countryName) && <small dir="auto">{[user.city, user.countryName].filter(Boolean).join('، ')}</small>}
          <small>{user.role === 'admin' ? 'أدمن · ' : ''}{engagementLabels[user.engagement]}</small></div>
        <button type="button" className="button secondary" disabled={busy} aria-expanded={selected === user.id}
          aria-label={`تعديل ملف ${user.displayName || user.email || 'المستخدم'}`}
          onClick={() => setSelected(selected === user.id ? undefined : user.id)}>{selected === user.id ? 'إغلاق' : 'تعديل'}</button>
      </div>
      {selected === user.id && <ProfileForm key={user.profileRevision} profile={user} api={api} busy={busy} onSave={fields => run(async () => {
        const updated = await api<AccountProfile>(`/admin/users/${encodeURIComponent(user.id)}`, 'PUT', fields);
        setPage(current => current && { ...current, users: current.users.map(item => item.id === updated.id ? updated : item) });
        setSelected(undefined);
        onSaved(updated);
      })} />}
    </li>)}</ul>}
    {page && <div className="actions">
      {query.after && <button type="button" className="plain" disabled={busy} onClick={() => load(query.name)}>أول صفحة</button>}
      {page.next && <button type="button" className="button secondary" disabled={busy} onClick={() => load(query.name, page.next!)}>الصفحة التالية</button>}
    </div>}
  </section>;
}
