import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { demoAdminEmail, demoPeople, type AccountProfile, type Config, type SessionSummary } from './types';
import { AdminUsers, MyAccount } from './androidProfiles';
import { AdminStudio } from './adminStudio';
import { JourneyHome, JourneySessions, JourneyStart } from './journey';
import { SessionPage } from './sessionPage';
import './style.css';

type Profile = { email: string; sessions: SessionSummary[] };
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Run = (work: () => Promise<void>) => void;
type Destination = 'home' | 'profile' | 'sessions' | 'new' | 'invite' | 'settings' | 'admin' | 'studio';

const localToken = 'mawadda-pilot-token';
const androidEdition = /^\/android(?:\/|$)/.test(location.pathname);
const inviteKey = 'mawadda-pilot-invite';

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, token: string | null, method = 'GET', body?: unknown): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(response.status, 'تعذّر قراءة ردّ خادم مَوَدّة. تحقّق من عنوان الخادم وحاول مجددًا.');
  }
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error || 'تعذّر إكمال الطلب.');
  return result as T;
}

function readInvite() {
  const code = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (code && /^[\w-]{43}$/.test(code)) {
    sessionStorage.setItem(inviteKey, code);
    history.replaceState(null, '', location.pathname + location.search);
    return code;
  }
  return sessionStorage.getItem(inviteKey);
}

function App() {
  const [config, setConfig] = useState<Config>();
  const [provider, setProvider] = useState<SupabaseClient>();
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState(readInvite);
  const [profile, setProfile] = useState<Profile>();
  const [account, setAccount] = useState<AccountProfile>();
  const [destination, setDestination] = useState<Destination>(invite ? 'invite' : 'home');
  const [active, setActive] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hasSessionDraft = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let ignore = false;
    request<Config>('/config', null).then(value => {
      if (ignore) return;
      setConfig(value);
      if (value.demo) { setToken(sessionStorage.getItem(localToken)); return; }
      const client = createClient(value.authUrl, value.authKey);
      setProvider(client);
      const { data } = client.auth.onAuthStateChange((_event, session) => setToken(session?.access_token ?? null));
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (!ignore) setError('تعذّر الاتصال بالخادم. حدّث الصفحة للمحاولة مجددًا.'); });
    return () => { ignore = true; unsubscribe?.(); };
  }, []);

  const api = useCallback<Api>((path, method, body) => request(path, token, method, body), [token]);
  const loadProfile = useCallback(async () => {
    setProfile(await api<Profile>('/me'));
  }, [api]);

  useEffect(() => {
    if (!token) { setProfile(undefined); setAccount(undefined); setActive(undefined); return; }
    let ignore = false;
    const accountRequest = androidEdition ? api<AccountProfile>('/account') : Promise.resolve(undefined);
    Promise.all([api<Profile>('/me'), accountRequest]).then(([profile, account]) => {
      if (!ignore) { setProfile(profile); setAccount(account); }
    }).catch(error => {
      if (ignore) return;
      if (error instanceof ApiError && error.status === 401 && config?.demo) {
        sessionStorage.removeItem(localToken);
        setToken(null);
      } else setError(error.message);
    });
    return () => { ignore = true; };
  }, [api, token, config]);

  const run: Run = work => {
    setBusy(true); setError(''); setMessage('');
    void work().catch(error => setError(error instanceof Error ? error.message : 'تعذّر إكمال الطلب.'))
      .finally(() => setBusy(false));
  };

  function acceptDemoToken(token: string) {
    sessionStorage.setItem(localToken, token);
    setToken(token);
  }

  const demoSignIn = (email: string) => run(async () => {
    const result = await request<{ token: string }>('/dev/sign-in', null, 'POST', { email });
    acceptDemoToken(result.token);
  });

  async function endSession() {
    if (config?.demo) {
      await api('/dev/sign-out', 'POST');
      sessionStorage.removeItem(localToken);
    } else if (provider) {
      const { error } = await provider.auth.signOut();
      if (error) throw new Error('تعذّر تسجيل الخروج. حاول مجددًا.');
    }
    setProfile(undefined); setAccount(undefined); setActive(undefined); setToken(null);
    setDestination(invite ? 'invite' : 'home');
  }

  const mayLeaveSession = () => !hasSessionDraft.current || window.confirm('في إجابات غير محفوظة. بدك تطلع من الجلسة؟');
  const signOut = () => { if (mayLeaveSession()) run(endSession); };

  const go = (next: Destination) => { setActive(undefined); setDestination(next); setError(''); setMessage(''); };
  const openSession = (id: string) => { setActive(id); setDestination('sessions'); setError(''); setMessage(''); };
  const clearInvite = () => { sessionStorage.removeItem(inviteKey); setInvite(null); };
  const acceptInvite = invite ? () => go('invite') : undefined;
  const start = () => go('new');
  const browse = () => go('sessions');
  const saveSession = (alias: string) => run(async () => {
    const accepting = destination === 'invite' && invite;
    const result = await api<{ id: string }>(accepting ? '/invitations/accept' : '/sessions', 'POST', accepting ? { alias, code: invite } : { alias });
    if (accepting) clearInvite();
    openSession(result.id);
    await loadProfile();
  });

  return <div className="site">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" type="button" disabled={busy} onClick={() => { if (mayLeaveSession()) go('home'); }} aria-label="مَوَدّة، الصفحة الرئيسية">
          <span className="brand-mark" aria-hidden="true">م</span><span>مَوَدّة<small>حوار قبل الزواج</small></span>
        </button>
        {token ? <button className="plain" type="button" onClick={signOut} disabled={busy}>تسجيل الخروج</button>
          : <span className="header-note">مساحة خاصة للطرفين</span>}
      </div>
    </header>
    <main className="container" id="content">
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {!config && !error && <p role="status">جارٍ فتح مَوَدّة…</p>}
      {config && !token && <section className="welcome">
        <div className="hero">
          <div className="hero-art" aria-hidden="true"><i /><i /><i /></div>
          <div className="hero-content"><p className="eyebrow">قبل الزواج</p>
            <h1>نبدأ بفهم<br />بعضنا أكثر.</h1>
            <p>جاوبوا على راحتكم، واختاروا متى تشاركوا الإجابات. بعدها افتحوا الحوار حول اللي اتفقتوا عليه واللي لسه بدّه نقاش.</p>
          </div>
        </div>
        <div className="card entry-card">
          <p className="eyebrow">{config.demo ? 'المعاينة المحلية' : 'أهلًا في مَوَدّة'}</p>
          <h2>{invite ? 'وصلتك دعوة للحوار' : androidEdition ? 'حساب مَوَدّة' : 'ابدأ جلسة تعارف'}</h2>
          {config.demo && androidEdition ? <>
            <Login run={run} busy={busy} onMessage={setMessage} demoPassword={async (input, register) => {
              try {
                const result = await request<{ token: string }>('/dev/password', null, 'POST', { ...input, register });
                acceptDemoToken(result.token);
              } catch (error) {
                if (error instanceof ApiError && error.status === 404) {
                  throw new Error('هالخادم ما فيه تسجيل حسابات أندرويد. افتح المعاينة على المنفذ 3004.');
                }
                throw error;
              }
            }} />
            <details className="demo-login"><summary>حسابات جاهزة للتجربة</summary><div className="demo-accounts">
              {demoPeople.map(person => <button type="button" className="button secondary" key={person.email} disabled={busy} onClick={() => demoSignIn(person.email)}>الدخول باسم {person.name}</button>)}
              <button type="button" className="button secondary" disabled={busy} onClick={() => demoSignIn(demoAdminEmail)}>الدخول كأدمن تجريبي</button>
            </div></details>
            <p className="muted small">استخدم بيانات افتراضية. تُمسح حسابات المعاينة عند إعادة تشغيل الخادم.</p>
          </> : config.demo ? <><p>اختَر حسابًا تجريبيًا. لتجربة الطرف الآخر، افتح رابط الدعوة في تبويب جديد وادخل بحساب مختلف.</p>
            <div className="demo-accounts">{demoPeople.map(person => <button className="button secondary" key={person.email} disabled={busy} onClick={() => demoSignIn(person.email)}>الدخول باسم {person.name}</button>)}</div>
            <p className="muted small">استخدم إجابات افتراضية. بيانات المعاينة مؤقتة وتُمسح عند إعادة تشغيل الخادم.</p></>
            : provider && <Login provider={provider} run={run} busy={busy} onMessage={setMessage} />}
        </div>
      </section>}
      {token && !profile && !error && <p role="status">جارٍ تحميل جلساتك…</p>}
      {profile && !active && <nav className="panels journey-nav" aria-label="أقسام حساب مَوَدّة">
        <button type="button" aria-pressed={destination === 'home'} disabled={busy} onClick={() => go('home')}>الرئيسية</button>
        <button type="button" aria-pressed={['sessions', 'new', 'invite'].includes(destination)} disabled={busy} onClick={browse}>جلساتي</button>
        {account && <button type="button" aria-pressed={destination === 'profile'} disabled={busy} onClick={() => go('profile')}>ملفي الشخصي</button>}
        <button type="button" aria-pressed={destination === 'settings'} disabled={busy} onClick={() => go('settings')}>الإعدادات</button>
        {account?.role === 'admin' && <button type="button" aria-pressed={destination === 'admin'} disabled={busy} onClick={() => go('admin')}>إدارة المستخدمين</button>}
        {account?.hasContentAdmin && <button type="button" aria-pressed={destination === 'studio'} disabled={busy} onClick={() => go('studio')}>لوحة الإدارة</button>}
      </nav>}
      {account && !active && destination === 'profile' && <MyAccount profile={account} api={api} busy={busy} onSave={fields => run(async () => {
        setAccount(await api<AccountProfile>('/account', 'PUT', fields));
        setMessage('حُفظ ملفك الشخصي.');
      })} />}
      {account?.role === 'admin' && !active && destination === 'admin' && <AdminUsers api={api} busy={busy} run={run} onSaved={updated => {
        if (updated.id === account.id) setAccount({ ...account, ...updated });
        setMessage('حُفظ ملف المستخدم.');
      }} />}
      {account?.hasContentAdmin && !active && destination === 'studio' && <AdminStudio api={api} busy={busy} run={run} onMessage={setMessage} />}
      {profile && !active && destination === 'home' && <JourneyHome sessions={profile.sessions} busy={busy} openSession={openSession}
        start={start} browse={browse} acceptInvite={acceptInvite} name={account?.displayName} editProfile={account ? () => go('profile') : undefined} />}
      {profile && !active && destination === 'sessions' && <JourneySessions sessions={profile.sessions} busy={busy}
        openSession={openSession} start={start} acceptInvite={acceptInvite} />}
      {profile && !active && (destination === 'new' || (destination === 'invite' && invite)) && <JourneyStart key={destination}
        mode={destination} name={account?.displayName} email={profile.email} busy={busy} save={saveSession} back={browse}
        dismiss={() => { clearInvite(); browse(); }} />}
      {profile && !active && destination === 'settings' && <section className="card journey-narrow data-settings">
        <h1>الإعدادات</h1>
        <h2>بياناتي في مَوَدّة</h2><p>الحذف يمسح إجاباتك وملاحظات الحوار المشتركة، وينهي جلساتك ويوقف المشاركة. تبقى إجابات الطرف الآخر خاصة به.</p>
          <button className="button danger" type="button" disabled={busy} onClick={() => {
            if (window.confirm('هل تريد حذف بياناتك من مَوَدّة؟ هذا الإجراء دائم.')) run(async () => {
              await api('/me', 'DELETE');
              if (androidEdition) await endSession();
              else { await loadProfile(); go('home'); }
              setMessage('تم حذف بياناتك من مَوَدّة.');
            });
          }}>حذف بياناتي</button>
      </section>}
      {profile && active && <SessionPage key={active} id={active} demo={Boolean(config?.demo)} androidEdition={androidEdition}
        profileSharing={account?.personalDetails !== undefined} api={api} run={run} busy={busy}
        onBack={() => { if (mayLeaveSession()) { browse(); run(loadProfile); } }} onMessage={setMessage} hasSessionDraft={hasSessionDraft} />}
    </main>
    <footer className="container footer"><span>مَوَدّة</span><span>أسئلة تساعد على بدء الحوار.</span></footer>
  </div>;
}

function Login({ provider, demoPassword, run, busy, onMessage }: {
  provider?: SupabaseClient;
  demoPassword?: (input: { email: string; password: string }, register: boolean) => Promise<void>;
  run: Run; busy: boolean; onMessage: (message: string) => void;
}) {
  const [register, setRegister] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const input = { email: String(fields.get('email')).trim(), password: String(fields.get('password')) };
    run(async () => {
      if (demoPassword) { await demoPassword(input, register); return; }
      if (!provider) return;
      const result = register ? await provider.auth.signUp({ ...input, options: { emailRedirectTo: location.origin + location.pathname } })
        : await provider.auth.signInWithPassword(input);
      if (result.error) throw new Error(register ? 'تعذّر إنشاء الحساب. تحقق من البريد وكلمة المرور.' : 'تعذّر الدخول. تحقق من البيانات وتأكيد البريد.');
      if (register && !result.data.session) onMessage('افتح رسالة التأكيد في بريدك ثم سجّل الدخول.');
    });
  }
  return <form onSubmit={submit}>
    <label>البريد الإلكتروني<input name="email" type="email" required autoComplete="email" dir="ltr" /></label>
    <label>كلمة المرور<input name="password" type="password" required minLength={register ? 8 : undefined} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} dir="ltr"
      aria-describedby={register ? 'signup-password-hint' : undefined} /></label>
    {register && <p id="signup-password-hint" className="muted small">استخدم 8 أحرف على الأقل.</p>}
    <div className="actions"><button className="button" disabled={busy}>{register ? 'إنشاء حساب' : 'تسجيل الدخول'}</button>
      <button className="plain" type="button" onClick={() => setRegister(!register)}>{register ? 'عندي حساب' : 'إنشاء حساب جديد'}</button></div>
  </form>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
