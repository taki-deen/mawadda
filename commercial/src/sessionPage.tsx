import { useCallback, useEffect, useRef, useState } from 'react';
import { demoPeople, isAnswered, type DraftAnswer, type QuestionView, type ReviewStatus, type SessionView } from './types';
import type { ProfileApi } from './androidProfiles';
import { SessionProfilePanel } from './profileDetails';
import { ApiError } from './apiClient';

type Run = (work: () => Promise<void>) => void;
type Panel = 'overview' | 'answers' | 'invite' | 'sharing' | 'comparison' | 'profile';
const statuses: Record<ReviewStatus, string> = { agree: 'اتفاق', partial: 'اتفاق جزئي', different: 'موضوع مفتوح' };

export function SessionPage({ id, demo, profileSharing, androidEdition, api, run, busy, onBack, onMessage, hasSessionDraft }: {
  id: string; demo: boolean; profileSharing: boolean; androidEdition: boolean; api: ProfileApi; run: Run; busy: boolean; onBack: () => void; onMessage: (message: string) => void;
  hasSessionDraft: { current: boolean };
}) {
  const [session, setSession] = useState<SessionView>();
  const [panel, setPanel] = useState<Panel>('overview');
  const [category, setCategory] = useState(0);
  const [current, setCurrent] = useState<number>();
  const [drafts, setDrafts] = useState<Partial<Record<number, DraftAnswer>>>({});
  const [inviteUrl, setInviteUrl] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [loadingCategory, setLoadingCategory] = useState(true);
  const sequence = useRef(0);
  const positions = useRef<Partial<Record<number, number>>>({});
  const categoryHeading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const pausedUntil = useRef(0);
  const base = `/sessions/${id}`;
  const hasDrafts = Object.values(drafts).some(Boolean);
  useEffect(() => {
    hasSessionDraft.current = hasDrafts;
    if (!hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { hasSessionDraft.current = false; window.removeEventListener('beforeunload', warn); };
  }, [hasDrafts, hasSessionDraft]);
  const refresh = useCallback(async () => {
    const requestNumber = ++sequence.current;
    try {
      const result = await api<SessionView>(`${base}?category=${category}`);
      if (requestNumber === sequence.current) { setSession(result); setLoadError(''); setLoadingCategory(false); setRetryAt(0); pausedUntil.current = 0; }
    } catch (error) {
      if (requestNumber === sequence.current) {
        setLoadError(error instanceof Error ? error.message : 'تعذّر تحميل المحور.');
        setLoadingCategory(false);
        const until = error instanceof ApiError ? error.retryAt : 0;
        setRetryAt(until);
        pausedUntil.current = until;
      }
    }
  }, [api, base, category]);

  useEffect(() => {
    const whenVisible = () => { if (!document.hidden && pausedUntil.current <= Date.now()) void refresh(); };
    void refresh();
    const timer = window.setInterval(whenVisible, 15_000);
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('focus', whenVisible);
    return () => {
      ++sequence.current; window.clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible); window.removeEventListener('focus', whenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  useEffect(() => {
    if (loadingCategory || !focusHeading.current) return;
    focusHeading.current = false;
    categoryHeading.current?.focus();
  }, [loadingCategory, panel]);

  const change = (path: string, method: string, body: unknown, message: string) => run(async () => {
    await api(base + path, method, body); await refresh(); onMessage(message);
  });

  const retryButton = loadError && <button type="button" className="button secondary" disabled={Boolean(retryAt)}
    onClick={() => { setLoadError(''); setLoadingCategory(true); void refresh(); }}>إعادة المحاولة</button>;

  if (!session) return <section className="card"><button className="plain" onClick={onBack}>العودة إلى جلساتي</button>
    <p role={loadError ? 'alert' : 'status'}>{loadError || 'جارٍ تحميل الجلسة…'}</p>{retryButton}</section>;

  const firstPending = session.questions.findIndex(item => !isAnswered(item.answer) && !item.answer.deferred);
  const questionIndex = Math.min(current ?? (firstPending < 0 ? 0 : firstPending), session.questions.length - 1);
  const question = session.questions[questionIndex];
  const draft = drafts[question.id];
  const answer = draft?.revision === question.answer.revision ? draft : question.answer;
  const isReady = !loadingCategory && !loadError && session.category === category;
  const firstQuestion = questionIndex === 0;
  const lastQuestion = questionIndex === session.questions.length - 1;
  const hasDraft = draft?.revision === question.answer.revision;
  const categoryHasDraft = session.questions.some(item => drafts[item.id]?.revision === item.answer.revision);
  const selectQuestion = (index: number) => {
    positions.current[category] = index;
    setCurrent(index);
  };
  const switchCategory = (next: number, index = positions.current[next]) => {
    if (next === category) return;
    ++sequence.current;
    focusHeading.current = true;
    setLoadingCategory(true);
    setLoadError('');
    setRetryAt(0);
    pausedUntil.current = 0;
    positions.current[next] = index;
    setCurrent(index);
    setCategory(next);
    onMessage('');
  };
  const switchPanel = (next: Panel) => {
    if (next === panel) return;
    focusHeading.current = true;
    setPanel(next);
    onMessage('');
    if (next === 'comparison') void refresh();
  };
  const openCategory = (index: number) => { switchCategory(index); switchPanel('answers'); };
  const inProgress = session.categoryProgress?.findIndex(item => item.completed > 0 && item.completed < item.total) ?? -1;
  const nextUnfinished = session.categoryProgress?.findIndex(item => item.completed < item.total) ?? 0;
  const totalProgress = session.categoryProgress?.reduce((total, item) => ({ completed: total.completed + item.completed, total: total.total + item.total }), { completed: 0, total: 0 });
  const continueAnswering = () => openCategory(inProgress >= 0 ? inProgress : nextUnfinished >= 0 ? nextUnfinished : category);
  const saveAnswer = (advance = false) => run(async () => {
    await api(`${base}/answers/${question.id}`, 'PUT', answer);
    setDrafts(values => ({ ...values, [question.id]: undefined }));
    await refresh();
    selectQuestion(advance && !lastQuestion ? questionIndex + 1 : questionIndex);
    if (advance && lastQuestion) switchPanel('sharing');
    onMessage('حُفظت إجابتك.');
  });

  return <>
    <button type="button" className="plain back" disabled={busy} onClick={onBack}>→ العودة إلى جلساتي</button>
    <section className="session-heading"><div><p className="eyebrow">جلسة {session.alias}{session.partnerAlias && ` و${session.partnerAlias}`}</p>
      <h1 ref={categoryHeading} tabIndex={-1}>{panel === 'overview' ? 'محاور الجلسة' : panel === 'invite' ? 'دعوة الطرف الآخر' : panel === 'profile' ? 'الملف المشترك' : session.categories[category]}</h1></div>
      {isReady && (panel === 'answers' || panel === 'overview') && <div className="progress">
        <span>{panel === 'overview' && totalProgress ? `${totalProgress.completed} من ${totalProgress.total}` : `${session.completed} من ${session.questions.length}`} إجابات مكتملة</span>
        <progress aria-label={panel === 'overview' ? 'تقدّم إجاباتك في الجلسة' : 'تقدّم إجاباتك في المحور'}
          value={panel === 'overview' ? totalProgress?.completed ?? session.completed : session.completed}
          max={panel === 'overview' ? totalProgress?.total ?? session.questions.length : session.questions.length} />
      </div>}
    </section>
    {session.closed && <p className="notice">انتهت الجلسة. إجاباتك ظاهرة لك والمشاركة متوقفة.</p>}
    <nav className="panels" aria-label="أقسام الجلسة">
      <button type="button" aria-pressed={panel === 'overview'} disabled={busy} onClick={() => switchPanel('overview')}>المحاور</button>
      {!session.closed && <button type="button" aria-pressed={panel === 'invite'} disabled={busy} onClick={() => switchPanel('invite')}>الطرف الآخر</button>}
      {([['answers', 'إجاباتي'], ['sharing', 'المشاركة'], ['comparison', 'المقارنة']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={panel === value} disabled={busy} onClick={() => switchPanel(value)}>{label}</button>)}
      {profileSharing && <button type="button" aria-pressed={panel === 'profile'} disabled={busy} onClick={() => switchPanel('profile')}>الملف المشترك</button>}
    </nav>
    {!isReady && <section className="card" aria-busy={loadingCategory}>
      <p role={loadError ? 'alert' : 'status'}>{loadError || 'جارٍ تحميل المحور…'}</p>
      {retryButton}
    </section>}
    {panel === 'overview' && <>
      {!session.closed && <section className="card journey-next">
        <div><h2>{session.partnerAlias ? 'الطرف الآخر انضم' : 'بانتظار الطرف الآخر'}</h2>
          <p className="muted">{session.partnerAlias ? 'اختَر محورًا للمتابعة، أو افتح المقارنة للمحور اللي شاركتوه.' : 'بتقدر تبدأ بالإجابة بشكل خاص قبل ما ينضم الطرف الآخر.'}</p></div>
        <div className="actions">
          {session.canInvite && <button type="button" className="button" disabled={busy} onClick={() => switchPanel('invite')}>دعوة الطرف الآخر</button>}
          <button type="button" className={session.canInvite ? 'button secondary' : 'button'} disabled={busy}
            onClick={nextUnfinished < 0 ? () => switchPanel('sharing') : continueAnswering}>
            {nextUnfinished < 0 ? 'مراجعة المشاركة' : totalProgress?.completed ? 'متابعة إجاباتي' : 'ابدأ بالإجابة'}
          </button>
        </div>
      </section>}
      <ul className="category-grid journey-categories" aria-label="محاور الجلسة">
        {session.categories.map((title, index) => {
          const progress = session.categoryProgress?.[index] ?? (session.category === index
            ? { completed: session.completed, total: session.questions.length } : undefined);
          return <li key={index}><button type="button" disabled={busy} aria-current={category === index ? 'true' : undefined} onClick={() => openCategory(index)}>
            <strong>{title}</strong>
            {progress && <>
              <small>{progress.completed === progress.total ? 'مكتمل' : `${progress.completed} من ${progress.total} مجابة`}</small>
              <progress aria-hidden="true" value={progress.completed} max={progress.total} />
            </>}
          </button></li>;
        })}
      </ul>
    </>}
    {isReady && panel === 'answers' && <div className="question-layout">
      <div className="card"><p className="eyebrow">السؤال {questionIndex + 1} من {session.questions.length}</p><h2>{question.text}</h2>
        <AnswerForm question={question} answer={answer} disabled={busy || session.closed} dirty={hasDraft} lastQuestion={lastQuestion}
          update={value => setDrafts(values => ({ ...values, [question.id]: value }))}
          save={saveAnswer} />
        <div className="question-arrows">
          <button type="button" className="plain" disabled={busy || (firstQuestion && category === 0)}
            onClick={() => firstQuestion ? switchCategory(category - 1, (session.categoryProgress?.[category - 1]?.total ?? session.questions.length) - 1) : selectQuestion(questionIndex - 1)}>{firstQuestion && category > 0 ? '→ المحور السابق' : '→ السابق'}</button>
          <button type="button" className="plain" disabled={busy || hasDraft}
            onClick={() => lastQuestion ? switchPanel(session.closed ? 'overview' : 'sharing') : selectQuestion(questionIndex + 1)}>
            {lastQuestion ? (session.closed ? 'المحاور ←' : 'مراجعة المشاركة ←') : 'التالي ←'}</button>
        </div>
      </div>
      <aside className="card question-nav" aria-label="أسئلة المحور"><h2>أسئلة المحور</h2><div>
        {session.questions.map((item, index) => <button key={item.id} type="button" disabled={busy}
          aria-label={`السؤال ${index + 1}${isAnswered(item.answer) ? '، مجاب' : item.answer.deferred ? '، مؤجل' : ''}`}
          aria-current={questionIndex === index ? 'step' : undefined} data-answered={isAnswered(item.answer)} onClick={() => selectQuestion(index)}>{index + 1}</button>)}
      </div></aside>
    </div>}
    {isReady && panel === 'invite' && <div className="journey-narrow">
      <section className="card"><h2>{session.partnerAlias ? 'حالة الدعوة' : 'رابط الدعوة'}</h2>
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
            <button type="button" className="button secondary" disabled={busy} onClick={() => run(async () => { await navigator.clipboard.writeText(inviteUrl); onMessage('نُسخ رابط الدعوة.'); })}>نسخ الرابط</button>
            <p className="small muted">الرابط صالح 24 ساعة ويُستخدم مرة واحدة، بالبريد المحدّد.</p></div>}
        </form>}
      </section>
    </div>}
    {isReady && panel === 'sharing' && <div className="journey-narrow">
      <section className="card"><h2>مشاركة هذا المحور</h2><p>تظهر المقارنة بعد موافقة الطرفين على إجاباتهم الحالية. إذا عدّلت إجابة، تتوقف المقارنة حتى تشارك النسخة الجديدة.</p>
        {!session.canShare && !session.closed && <p className="notice">بتقدر تشارك المحور بعد انضمام الطرف الآخر.</p>}
        {categoryHasDraft && <p className="notice">في تعديلات غير محفوظة. احفظها من «إجاباتي» قبل المشاركة.</p>}
        {session.canShare && <ul className="sharing-status"><li>أنت {session.mineShared ? 'وافقت على المشاركة' : 'لم تشارك بعد'}</li>
          <li>{session.partnerAlias} {session.partnerShared ? 'وافق على المشاركة' : 'لم يشارك بعد'}</li></ul>}
        {session.canShare && <><details className="preview"><summary>معاينة إجاباتك قبل المشاركة</summary><ul>
          {session.questions.filter(item => isAnswered(item.answer)).map(item => <li key={item.id}><strong>{item.text}</strong><AnswerText answer={item.answer} /><small>الأهمية {item.answer.importance} من 3</small></li>)}
        </ul></details><button className={session.mineShared ? 'button secondary' : 'button'} disabled={busy || (!session.mineShared && (!session.completed || categoryHasDraft))}
          onClick={() => change('/consent', 'PUT', session.mineShared ? { category, share: false } : { category, share: true, fingerprint: session.fingerprint },
            session.mineShared ? 'توقفت مشاركة إجاباتك.' : 'حُفظت موافقتك على المشاركة.')}>{session.mineShared ? 'سحب الموافقة' : 'أوافق على مشاركة إجابات المحور'}</button></>}
        <div className="actions">
          {session.comparisonOpen && <button type="button" className="button" disabled={busy} onClick={() => switchPanel('comparison')}>افتح المقارنة</button>}
          {session.canInvite && <button type="button" className="button secondary" disabled={busy} onClick={() => switchPanel('invite')}>دعوة الطرف الآخر</button>}
          {category + 1 < session.categories.length && <button type="button" className="plain" disabled={busy} onClick={() => openCategory(category + 1)}>المحور التالي ←</button>}
        </div>
      </section>
    </div>}
    {isReady && panel === 'comparison' && <Comparison session={session} busy={busy} change={change} onSharing={() => switchPanel('sharing')} />}
    {isReady && panel === 'profile' && <SessionProfilePanel path={`${base}/profile-share`} api={api} run={run} busy={busy} onMessage={onMessage} />}
    {isReady && panel === 'overview' && !session.closed && <div className="close-session"><button type="button" className="plain" disabled={busy} onClick={() => {
      if (window.confirm('إنهاء الجلسة يوقف المشاركة للطرفين. هل تريد المتابعة؟')) change('/close', 'POST', undefined, 'انتهت الجلسة وتوقفت المشاركة.');
    }}>إنهاء الجلسة</button></div>}
  </>;
}

function AnswerForm({ question, answer, disabled, dirty, lastQuestion, save, update }: {
  question: QuestionView; answer: DraftAnswer; disabled: boolean; dirty: boolean; lastQuestion: boolean;
  save: (advance?: boolean) => void; update: (answer: DraftAnswer) => void;
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
      <div className="actions">
        <button type="button" className="button" disabled={!dirty} onClick={() => save(true)}>{lastQuestion ? 'حفظ ومراجعة المشاركة' : 'حفظ ومتابعة'}</button>
        <button className="button secondary" disabled={!dirty}>حفظ الإجابة</button>
      </div>
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
