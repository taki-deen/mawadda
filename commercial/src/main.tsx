import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { demoAdminEmail, demoPeople, isAnswered, type AccountProfile, type Config, type DraftAnswer, type QuestionView, type ReviewStatus, type SessionSummary, type SessionView } from './types';
import { AdminUsers, MyAccount } from './androidProfiles';
import { AdminStudio } from './adminStudio';
import { SessionProfilePanel } from './profileDetails';
import './style.css';

type Profile = { email: string; sessions: SessionSummary[] };
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Run = (work: () => Promise<void>) => void;
type Panel = 'answers' | 'sharing' | 'comparison' | 'profile';

const localToken = 'mawadda-pilot-token';
const androidEdition = /^\/android(?:\/|$)/.test(location.pathname);
const inviteKey = 'mawadda-pilot-invite';
const statuses: Record<ReviewStatus, string> = { agree: 'اتفاق', partial: 'اتفاق جزئي', different: 'موضوع مفتوح' };

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
  const [destination, setDestination] = useState<'profile' | 'sessions' | 'admin' | 'studio'>(invite ? 'sessions' : 'profile');
  const [active, setActive] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    setDestination(invite ? 'sessions' : 'profile');
  }

  const signOut = () => run(endSession);

  const openSession = (id: string) => { setActive(id); setError(''); setMessage(''); };
  const clearInvite = () => { sessionStorage.removeItem(inviteKey); setInvite(null); };

  return <div className="site">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" type="button" onClick={() => { setActive(undefined); setMessage(''); setError(''); }} aria-label="مَوَدّة، الصفحة الرئيسية">
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
      {account && !active && <nav className="panels" aria-label="أقسام حساب مَوَدّة">
        <button type="button" aria-pressed={destination === 'profile'} disabled={busy} onClick={() => setDestination('profile')}>ملفي الشخصي</button>
        <button type="button" aria-pressed={destination === 'sessions'} disabled={busy} onClick={() => setDestination('sessions')}>جلسات التعارف</button>
        {account.role === 'admin' && <button type="button" aria-pressed={destination === 'admin'} disabled={busy} onClick={() => setDestination('admin')}>إدارة المستخدمين</button>}
        {account.hasContentAdmin && <button type="button" aria-pressed={destination === 'studio'} disabled={busy} onClick={() => setDestination('studio')}>لوحة الإدارة</button>}
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
      {profile && !active && (!androidEdition || destination === 'sessions') && <>
        <section className="dashboard-heading"><p className="eyebrow">{config?.demo ? 'المعاينة المحلية' : 'مَوَدّة'}</p><h1>جلسات التعارف</h1>
          <p className="muted">أجب عن أسئلة المحور بطريقتك، ثم شاركها وقت ما تكون جاهز.</p></section>
        <div className="dashboard-grid">
          <section className="card">
            <h2>{invite ? 'قبول الدعوة' : 'جلسة جديدة'}</h2>
            <p className="muted">{invite ? 'رح يظهر اسمك للطرف اللي دعاك.' : 'اختَر من 15 محورًا وادعُ الطرف الآخر بعد إنشاء الجلسة.'}</p>
            <form onSubmit={event => {
              event.preventDefault();
              const alias = String(new FormData(event.currentTarget).get('alias'));
              run(async () => {
                const result = await api<{ id: string }>(invite ? '/invitations/accept' : '/sessions', 'POST', invite ? { alias, code: invite } : { alias });
                clearInvite(); await loadProfile(); openSession(result.id);
              });
            }}>
              <label>الاسم اللي رح يظهر للطرف الآخر<input name="alias" required maxLength={60} autoComplete="nickname" defaultValue={account?.displayName} /></label>
              <div className="actions"><button className="button" disabled={busy}>{invite ? 'قبول الدعوة' : 'إنشاء جلسة'}</button>
                {invite && <button className="plain" type="button" onClick={clearInvite}>إغلاق الدعوة</button>}</div>
            </form>
          </section>
          <section className="card">
            <h2>جلساتك</h2>
            {profile.sessions.length === 0 ? <p className="muted">بعد ما تبدأ جلسة أو تقبل دعوة، رح تلاقيها هون.</p> : <ul className="session-list">
              {profile.sessions.map(session => <li key={session.id}><button type="button" onClick={() => openSession(session.id)}>
                <strong>{session.title}</strong><small>{session.closed ? 'جلسة منتهية' : session.partnerAlias ? `مع ${session.partnerAlias}` : 'بانتظار الطرف الآخر'}</small>
              </button></li>)}</ul>}
          </section>
        </div>
        <details className="data-settings"><summary>بياناتي في مَوَدّة</summary><p>الحذف يمسح إجاباتك وملاحظات الحوار المشتركة، وينهي جلساتك ويوقف المشاركة. تبقى إجابات الطرف الآخر خاصة به.</p>
          <button className="button danger" type="button" disabled={busy} onClick={() => {
            if (window.confirm('هل تريد حذف بياناتك من مَوَدّة؟ هذا الإجراء دائم.')) run(async () => {
              await api('/me', 'DELETE');
              if (androidEdition) await endSession();
              else await loadProfile();
              setMessage('تم حذف بياناتك من مَوَدّة.');
            });
          }}>حذف بياناتي</button>
        </details>
      </>}
      {profile && active && <SessionPage key={active} id={active} demo={Boolean(config?.demo)} profileSharing={account?.personalDetails !== undefined} api={api} run={run} busy={busy}
        onBack={() => { setActive(undefined); run(loadProfile); }} onMessage={setMessage} />}
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

function SessionPage({ id, demo, profileSharing, api, run, busy, onBack, onMessage }: {
  id: string; demo: boolean; profileSharing: boolean; api: Api; run: Run; busy: boolean; onBack: () => void; onMessage: (message: string) => void;
}) {
  const [session, setSession] = useState<SessionView>();
  const [panel, setPanel] = useState<Panel>('answers');
  const [category, setCategory] = useState(0);
  const [current, setCurrent] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<number, DraftAnswer>>>({});
  const [inviteUrl, setInviteUrl] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadingCategory, setLoadingCategory] = useState(true);
  const sequence = useRef(0);
  const positions = useRef<Partial<Record<number, number>>>({});
  const categoryDialog = useRef<HTMLDialogElement>(null);
  const categoryHeading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const base = `/sessions/${id}`;
  const refresh = useCallback(async () => {
    const requestNumber = ++sequence.current;
    try {
      const result = await api<SessionView>(`${base}?category=${category}`);
      if (requestNumber === sequence.current) { setSession(result); setLoadError(''); setLoadingCategory(false); }
    } catch (error) {
      if (requestNumber === sequence.current) { setLoadError((error as Error).message); setLoadingCategory(false); }
    }
  }, [api, base, category]);

  useEffect(() => {
    const whenVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(whenVisible, 5000);
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('focus', whenVisible);
    return () => {
      ++sequence.current; window.clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible); window.removeEventListener('focus', whenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (loadingCategory || !focusHeading.current) return;
    focusHeading.current = false;
    categoryHeading.current?.focus();
  }, [loadingCategory]);

  const change = (path: string, method: string, body: unknown, message: string) => run(async () => {
    await api(base + path, method, body); await refresh(); onMessage(message);
  });

  if (!session) return <section className="card"><button className="plain" onClick={onBack}>العودة إلى جلساتي</button>
    <p role={loadError ? 'alert' : 'status'}>{loadError || 'جارٍ تحميل الجلسة…'}</p></section>;

  const question = session.questions[current] ?? session.questions[0];
  const draft = drafts[question.id];
  const answer = draft?.revision === question.answer.revision ? draft : question.answer;
  const isReady = !loadingCategory && !loadError && session.category === category;
  const firstQuestion = current === 0;
  const lastQuestion = current === session.questions.length - 1;
  const selectQuestion = (index: number) => {
    positions.current[category] = index;
    setCurrent(index);
  };
  const switchCategory = (next: number, index = positions.current[next] ?? 0) => {
    if (next === category) return;
    ++sequence.current;
    focusHeading.current = true;
    setLoadingCategory(true);
    setLoadError('');
    positions.current[next] = index;
    setCurrent(index);
    setCategory(next);
    onMessage('');
  };
  const switchPanel = (next: Panel) => { setPanel(next); if (next === 'comparison') void refresh(); };

  return <>
    <button type="button" className="plain back" onClick={onBack}>→ العودة إلى جلساتي</button>
    <section className="session-heading"><div><p className="eyebrow">جلسة {session.alias}{session.partnerAlias && ` و${session.partnerAlias}`}</p>
      <h1 ref={categoryHeading} tabIndex={-1}>{session.categories[category]}</h1></div>{isReady && <div className="progress"><span>{session.completed} من {session.questions.length} إجابات مكتملة</span>
      <progress aria-label="تقدّم إجاباتك في المحور" value={session.completed} max={session.questions.length} /></div>}</section>
    <div className="category-toolbar">
      <button type="button" className="button secondary" aria-haspopup="dialog" aria-controls="category-board" disabled={busy}
        onClick={() => categoryDialog.current?.showModal()}>كل المحاور</button>
      <span className="muted small">المحور {category + 1} من {session.categories.length}</span>
    </div>
    <dialog ref={categoryDialog} id="category-board" className="category-board" aria-labelledby="category-board-title">
      <div className="category-board-header"><h2 id="category-board-title">محاور الجلسة</h2>
        <button type="button" className="plain" onClick={() => categoryDialog.current?.close()}>إغلاق</button></div>
      <ul className="category-grid">
        {session.categories.map((title, index) => {
          const progress = session.categoryProgress?.[index] ?? (session.category === index
            ? { completed: session.completed, total: session.questions.length } : undefined);
          return <li key={title}><button type="button" aria-current={category === index ? 'true' : undefined}
            onClick={() => { categoryDialog.current?.close(); switchCategory(index); }}>
            <strong>{title}</strong>
            {progress && <>
              <small>{progress.completed === progress.total ? 'مكتمل' : `${progress.completed} من ${progress.total} مجابة`}</small>
              <progress aria-hidden="true" value={progress.completed} max={progress.total} />
            </>}
          </button></li>;
        })}
      </ul>
    </dialog>
    {session.closed && <p className="notice">انتهت الجلسة. إجاباتك ظاهرة لك والمشاركة متوقفة.</p>}
    <nav className="panels" aria-label="أقسام الجلسة">
      {([['answers', 'إجاباتي'], ['sharing', 'المشاركة'], ['comparison', 'المقارنة']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={panel === value} onClick={() => switchPanel(value)}>{label}</button>)}
      {profileSharing && <button type="button" aria-pressed={panel === 'profile'} onClick={() => switchPanel('profile')}>الملف المشترك</button>}
    </nav>
    {!isReady && <section className="card" aria-busy={loadingCategory}>
      <p role={loadError ? 'alert' : 'status'}>{loadError || 'جارٍ تحميل المحور…'}</p>
      {loadError && <button type="button" className="button secondary" onClick={() => { setLoadError(''); setLoadingCategory(true); void refresh(); }}>إعادة المحاولة</button>}
    </section>}
    {isReady && panel === 'answers' && <div className="question-layout">
      <aside className="card question-nav" aria-label="أسئلة المحور"><h2>أسئلة المحور</h2><div>
        {session.questions.map((item, index) => <button key={item.id} type="button" aria-label={`السؤال ${index + 1}${isAnswered(item.answer) ? '، مجاب' : ''}`}
          aria-current={current === index ? 'step' : undefined} data-answered={isAnswered(item.answer)} onClick={() => selectQuestion(index)}>{index + 1}</button>)}
      </div></aside>
      <div className="card"><p className="eyebrow">السؤال {current + 1} من {session.questions.length}</p><h2>{question.text}</h2>
        <AnswerForm question={question} answer={answer} disabled={busy || session.closed}
          update={value => setDrafts(values => ({ ...values, [question.id]: value }))}
          save={() => run(async () => {
            await api(`${base}/answers/${question.id}`, 'PUT', answer);
            await refresh();
            setDrafts(values => ({ ...values, [question.id]: undefined }));
            onMessage('حُفظت إجابتك.');
          })} />
        <div className="question-arrows">
          <button type="button" className="plain" disabled={busy || (firstQuestion && category === 0)}
            onClick={() => firstQuestion ? switchCategory(category - 1, (session.categoryProgress?.[category - 1]?.total ?? session.questions.length) - 1) : selectQuestion(current - 1)}>{firstQuestion && category > 0 ? '→ المحور السابق' : '→ السابق'}</button>
          <button type="button" className="plain" disabled={busy || (lastQuestion && category === session.categories.length - 1)}
            onClick={() => lastQuestion ? switchCategory(category + 1, 0) : selectQuestion(current + 1)}>{lastQuestion && category < session.categories.length - 1 ? 'المحور التالي ←' : 'التالي ←'}</button>
        </div>
      </div>
    </div>}
    {isReady && panel === 'sharing' && <div className="dashboard-grid">
      <section className="card"><h2>الطرف الآخر</h2>
        {session.partnerAlias ? <p>{session.partnerAlias} انضم إلى الجلسة.</p> : <p className="muted">بانتظار انضمام الطرف الآخر.</p>}
        {session.canInvite && <form onSubmit={event => {
          event.preventDefault();
          const email = String(new FormData(event.currentTarget).get('email')).trim();
          run(async () => {
            const { code } = await api<{ code: string }>(`${base}/invite`, 'POST', { email });
            setInviteUrl(`${location.origin}${androidEdition ? '/android/' : '/'}#invite=${code}`);
          });
        }}>
          <label>بريد الطرف الآخر<input type="email" name="email" required dir="ltr" list="demo-emails" /></label>
          {demo && <datalist id="demo-emails">{demoPeople.map(person => <option key={person.email} value={person.email}>{person.name}</option>)}</datalist>}
          <button className="button" disabled={busy}>إنشاء رابط دعوة</button>
          {inviteUrl && <div className="invite-result"><label>رابط الدعوة<input value={inviteUrl} readOnly dir="ltr" onFocus={event => event.target.select()} /></label>
            <button type="button" className="button secondary" onClick={() => run(async () => { await navigator.clipboard.writeText(inviteUrl); onMessage('نُسخ رابط الدعوة.'); })}>نسخ الرابط</button>
            <p className="small muted">الرابط صالح 24 ساعة ويُستخدم مرة واحدة، بالبريد المحدّد.</p></div>}
        </form>}
      </section>
      <section className="card"><h2>مشاركة هذا المحور</h2><p>تظهر المقارنة بعد موافقة الطرفين على إجاباتهم الحالية. إذا عدّلت إجابة، تتوقف المقارنة حتى تشارك النسخة الجديدة.</p>
        {session.canShare && <ul className="sharing-status"><li>أنت {session.mineShared ? 'وافقت على المشاركة' : 'لم تشارك بعد'}</li>
          <li>{session.partnerAlias} {session.partnerShared ? 'وافق على المشاركة' : 'لم يشارك بعد'}</li></ul>}
        {session.canShare && <><details className="preview"><summary>معاينة إجاباتك قبل المشاركة</summary><ul>
          {session.questions.filter(item => isAnswered(item.answer)).map(item => <li key={item.id}><strong>{item.text}</strong><AnswerText answer={item.answer} /><small>الأهمية {item.answer.importance} من 3</small></li>)}
        </ul></details><button className={session.mineShared ? 'button secondary' : 'button'} disabled={busy || (!session.mineShared && !session.completed)}
          onClick={() => change('/consent', 'PUT', session.mineShared ? { category, share: false } : { category, share: true, fingerprint: session.fingerprint },
            session.mineShared ? 'توقفت مشاركة إجاباتك.' : 'حُفظت موافقتك على المشاركة.')}>{session.mineShared ? 'سحب الموافقة' : 'أوافق على مشاركة إجابات المحور'}</button></>}
      </section>
    </div>}
    {isReady && panel === 'comparison' && <Comparison session={session} busy={busy} change={change} onSharing={() => switchPanel('sharing')} />}
    {isReady && panel === 'profile' && <SessionProfilePanel path={`${base}/profile-share`} api={api} run={run} busy={busy} onMessage={onMessage} />}
    {isReady && !session.closed && <div className="close-session"><button type="button" className="plain" disabled={busy} onClick={() => {
      if (window.confirm('إنهاء الجلسة يوقف المشاركة للطرفين. هل تريد المتابعة؟')) change('/close', 'POST', undefined, 'انتهت الجلسة وتوقفت المشاركة.');
    }}>إنهاء الجلسة</button></div>}
  </>;
}

function AnswerForm({ question, answer, disabled, save, update }: {
  question: QuestionView; answer: DraftAnswer; disabled: boolean; save: () => void; update: (answer: DraftAnswer) => void;
}) {
  const change = <K extends keyof DraftAnswer>(key: K, value: DraftAnswer[K]) => update({ ...answer, [key]: value });
  return <form onSubmit={event => { event.preventDefault(); save(); }}>
    <fieldset disabled={disabled}>
      {question.options && <label>اختر جوابًا<select value={answer.choice} onChange={event => change('choice', event.target.value)}>
        <option value="">اختياري</option>{question.options.map(option => <option key={option}>{option}</option>)}
      </select></label>}
      <label>{question.options ? 'حابب تضيف تفاصيل؟' : 'إجابتك'}<textarea value={answer.text} onChange={event => change('text', event.target.value)} rows={4} maxLength={3000} placeholder="احكِ بطريقتك…" /></label>
      <label>أهمية الموضوع<select value={answer.importance} onChange={event => change('importance', Number(event.target.value))}>
        <option value={1}>تفضيل شخصي</option><option value={2}>قابل للنقاش</option><option value={3}>أساسي عندي</option>
      </select></label>
      <label className="checkbox"><input type="checkbox" checked={answer.deferred} onChange={event => change('deferred', event.target.checked)} />أؤجّل الإجابة</label>
      <button className="button">حفظ الإجابة</button>
    </fieldset>
  </form>;
}

function AnswerText({ answer }: { answer: DraftAnswer }) {
  if (!isAnswered(answer)) return <p className="muted">{answer.deferred ? 'إجابة مؤجلة' : 'بانتظار الإجابة'}</p>;
  return <>{answer.choice && <p><strong>{answer.choice}</strong></p>}{answer.text && <p className="answer-text" dir="auto">{answer.text}</p>}</>;
}

type Change = (path: string, method: string, body: unknown, message: string) => void;

function Comparison({ session, busy, change, onSharing }: { session: SessionView; busy: boolean; change: Change; onSharing: () => void }) {
  const report = session.report;
  if (!report) return <section className="card locked"><h2>{session.closed ? 'توقفت المقارنة بانتهاء الجلسة' : 'المقارنة خاصة حتى يوافق الطرفان'}</h2>
    {!session.closed && <button type="button" className="button secondary" onClick={onSharing}>إعدادات المشاركة</button>}</section>;
  const approvedNotes = session.questions.filter(question => question.review?.mine && question.review.partner);
  return <section className="comparison"><div className="card report"><h2>ملخّص الحوار</h2>
    <dl><div><dt>اتفاقات وملاحظات معتمدة</dt><dd>{report.approved}</dd></div><div><dt>أسئلة أجاب عنها الطرفان</dt><dd>{report.paired}</dd></div>
      <div><dt>مؤشر وصفي</dt><dd>{report.score === null ? '—' : `${report.score}٪`}</dd></div></dl>
    <p className="muted small">المؤشر مبني على {report.scored} من {session.questions.length} أسئلة. المؤشر وصفي وغير سريري. الإجابات المفتوحة تدخل في الحساب بعد تقييم مشترك.</p>
    {approvedNotes.length > 0 && <div className="approved-notes"><h3>خلاصات اعتمدها الطرفان</h3><ul>{approvedNotes.map(question => <li key={question.id}>
      <strong>{question.text}</strong> <small>{statuses[question.review!.status]}</small>
      {question.review?.note && <p className="answer-text" dir="auto">{question.review.note}</p>}
    </li>)}</ul></div>}
  </div>
  {session.questions.map(question => <details className="card compare-item" key={question.id}>
    <summary><span>{question.text}</span>{question.review && <small>{question.review.mine && question.review.partner ? 'معتمد من الطرفين' : 'بحاجة لاعتماد'}</small>}</summary>
    <div className="paired"><div><strong>إجابتك</strong><AnswerText answer={question.answer} /></div>
      <div><strong>إجابة {session.partnerAlias}</strong>{question.partner && <AnswerText answer={question.partner} />}</div></div>
    {question.partner && isAnswered(question.answer) && isAnswered(question.partner) &&
      <ReviewForm key={question.review?.revision ?? 0} question={question} busy={busy} change={change} />}
  </details>)}</section>;
}

function ReviewForm({ question, busy, change }: { question: QuestionView; busy: boolean; change: Change }) {
  const [status, setStatus] = useState(question.review?.status ?? 'agree');
  const [note, setNote] = useState(question.review?.note ?? '');
  const path = `/reviews/${question.id}`;
  const rev = question.review?.revision ?? 0;
  const dirty = status !== question.review?.status || note !== question.review?.note;
  return <form className="review" onSubmit={event => {
    event.preventDefault(); change(path, 'PUT', { status, note, revision: rev }, 'حُفظت ملاحظة الحوار.');
  }}><fieldset disabled={busy}>
    <legend>خلاصة هذا السؤال</legend>
    <label>نتيجة الحوار<select value={status} onChange={event => setStatus(event.target.value as ReviewStatus)}>
      {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label>الاتفاق أو الخطوة التالية<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={2000} /></label>
    <div className="actions"><button className="button secondary" disabled={!dirty}>حفظ الملاحظة</button>
      {question.review && !question.review.mine && <button className="button" type="button" disabled={dirty}
        onClick={() => change(`${path}/approve`, 'POST', { revision: rev }, 'حُفظ اعتمادك للملاحظة.')}>أعتمد الملاحظة</button>}</div>
    {question.review && <p className="muted small">{question.review.mine ? 'أنت اعتمدت' : 'بانتظار اعتمادك'} · {question.review.partner ? 'الطرف الآخر اعتمد' : 'بانتظار اعتماد الطرف الآخر'}</p>}
  </fieldset></form>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
