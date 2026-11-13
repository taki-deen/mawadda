import { lazy, Suspense, useEffect, useState } from 'react';
import { engagementLabels, type AccountProfile, type CityOption, type CountryOption, type Engagement, type ProfileFields } from './types';
import { personalValues, profileGenderLabels } from './personalProfile';
import { PersonalFields, ProfileValues, readPersonalDetails } from './profileDetails';
import { CustomProfileField, ProfileChoices, ProfileLookup, ProfileTextField } from './profileInputs';

export type ProfileApi = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Run = (work: () => Promise<void>) => void;
const CountryMap = lazy(() => import('./countryMap').catch(() => ({
  default: () => <p role="status" className="muted small">تعذّر تحميل الخريطة. اختَر الدولة من القائمة.</p>,
})));
const engagementOptions = Object.entries(engagementLabels).map(([value, label]) => ({ value, label }));

function ProfileForm({ profile, api, busy, onSave }: {
  profile: AccountProfile; api: ProfileApi; busy: boolean; onSave: (fields: ProfileFields) => void;
}) {
  const [location, setLocation] = useState<{ countryCode: string; cityId: string | null }>();
  const supportsLocations = profile.countryCode !== undefined;

  return <form className="profile-edit" onInvalidCapture={event => {
    const section = (event.target as HTMLElement).closest<HTMLDetailsElement>('details.profile-section');
    if (section) section.open = true;
  }} onSubmit={event => {
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
      <div className="profile-basics">
        <ProfileTextField label="الاسم الظاهر" name="displayName" autoComplete="nickname" required maxLength={60} value={profile.displayName} />
        {supportsLocations ? <ProfileLocation profile={profile} api={api} onChange={setLocation} busy={busy} />
          : <ProfileTextField label="المدينة (اختياري)" name="city" autoComplete="address-level2" maxLength={80} value={profile.city} />}
        <ProfileChoices label="حالة الخطوبة" name="engagement" initialValue={profile.engagement} options={engagementOptions} />
      </div>
      {profile.personalDetails && <PersonalFields details={profile.personalDetails} />}
      {Boolean(profile.customFields?.length) && <details className="profile-section"><summary>حقول إضافية</summary>
        <div className="personal-fields">{profile.customFields?.map(field =>
          <CustomProfileField key={field.id} field={field} value={profile.customValues?.[field.id]} />)}</div>
      </details>}
      <button className="button">حفظ الملف الشخصي</button>
    </fieldset>
  </form>;
}

function ProfileLocation({ profile, api, onChange, busy }: {
  profile: AccountProfile; api: ProfileApi; busy: boolean; onChange: (location: { countryCode: string; cityId: string | null }) => void;
}) {
  const [countries, setCountries] = useState<CountryOption[]>();
  const [countryError, setCountryError] = useState(false);
  const [country, setCountry] = useState(profile.countryCode ?? '');
  const [city, setCity] = useState<CityOption | null>(profile.cityId ? { id: profile.cityId, name: profile.city, region: '' } : null);
  const [searching, setSearching] = useState(!profile.cityId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ key: string; options: CityOption[] | null }>();
  const [showLegacy, setShowLegacy] = useState(Boolean(profile.city && !profile.cityId));
  const [mapOpened, setMapOpened] = useState(false);
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
  const countryChoices = countries?.map(item => ({ value: item.code, label: item.name }));
  if (country && countryChoices && !countryChoices.some(option => option.value === country)) {
    countryChoices.unshift({ value: country, label: profile.countryName || country });
  }
  const chooseCountry = (next: string) => {
    if (next === country) return;
    setCountry(next); setCity(null); setQuery(''); setResults(undefined); setSearching(true); setShowLegacy(false);
    onChange({ countryCode: next, cityId: null });
  };
  const chooseCity = (option: CityOption) => {
    setCity(option); setSearching(false); setQuery(''); setShowLegacy(false);
    onChange({ countryCode: country, cityId: option.id });
  };

  return <div className="profile-location">
    {countryChoices ? <ProfileLookup label="الدولة (اختياري)" searchLabel="بحث عن دولة" placeholder="اكتب اسم الدولة" emptyLabel="اختر الدولة"
      value={country} options={countryChoices} onSelect={chooseCountry} /> : <p className="muted small" role="status">
        {countryError ? 'تعذّر تحميل الدول. أعد فتح الملف للمحاولة.' : 'جارٍ تحميل الدول…'}
      </p>}
    {countries && <details className="country-map-picker" onToggle={event => { if (event.currentTarget.open) setMapOpened(true); }}>
      <summary>اختيار الدولة من الخريطة</summary>
      {mapOpened && <Suspense fallback={<p role="status" className="muted small">جارٍ تحميل الخريطة…</p>}>
        <CountryMap countries={countries} country={country} onSelect={chooseCountry} disabled={busy} />
      </Suspense>}
    </details>}
    {showLegacy && <p className="muted small">المدينة المحفوظة {profile.city}. اختر الدولة لتحديثها من القائمة.</p>}
    {city && <div className="profile-field profile-city-selected">
      <span><small>المدينة</small><strong dir="auto">{city.name}</strong></span>
      <div className="actions">
        <button type="button" className="plain" aria-expanded={searching} onClick={() => setSearching(!searching)}>{searching ? 'إغلاق البحث' : 'تغيير المدينة'}</button>
        <button type="button" className="plain" onClick={() => { setCity(null); setSearching(true); onChange({ countryCode: country, cityId: null }); }}>مسح المدينة</button>
      </div>
    </div>}
    {country && searching && <div className="profile-field profile-city-picker">
      <label>ابحث عن مدينة (اختياري)<input type="search" maxLength={80} value={query} placeholder="اكتب اسم المدينة" onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (options?.length === 1) chooseCity(options[0]);
        }} /></label>
      {options === undefined && <p className="muted small" role="status">جارٍ تحميل المدن…</p>}
      {options === null && <p className="muted small" role="status">تعذّر تحميل المدن. غيّر البحث للمحاولة.</p>}
      {options?.length === 0 && <p className="muted small" role="status">ما في مدن مطابقة ضمن القائمة.</p>}
      {options && options.length > 0 && <ul className="profile-city-options" aria-label="خيارات المدينة">
        {options.map(option => <li key={option.id}><button type="button" onClick={() => chooseCity(option)}>
          <span dir="auto">{option.name}</span>{option.region && <small dir="auto">{option.region}</small>}</button></li>)}
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
        {profile.personalDetails?.gender && <div><dt>الجنس</dt><dd>{profileGenderLabels[profile.personalDetails.gender]}</dd></div>}
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
