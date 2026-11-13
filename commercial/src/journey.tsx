import type { SessionSummary } from './types';

type SessionListProps = { sessions: SessionSummary[]; busy: boolean; openSession: (id: string) => void };

function sessionState(session: SessionSummary) {
  if (session.closed) return 'جلسة منتهية';
  return session.partnerAlias ? `مع ${session.partnerAlias}` : 'بانتظار الطرف الآخر';
}

export function JourneyHome({ sessions, busy, openSession, start, browse, acceptInvite, name, editProfile }: SessionListProps & {
  start: () => void; browse: () => void; acceptInvite?: () => void; name?: string; editProfile?: () => void;
}) {
  const ongoing = sessions.find(session => !session.closed);
  const next = acceptInvite ?? (ongoing ? () => openSession(ongoing.id) : start);

  return <>
    <section className="card journey-hero">
      <div>
        <h1>{name ? `أهلًا، ${name}` : 'أهلًا في مَوَدّة'}</h1>
        <p>{acceptInvite ? 'وصلتك دعوة للانضمام إلى جلسة تعارف.' : ongoing ? sessionState(ongoing) : 'ابدأ جلسة تعارف مع الطرف الآخر وناقشوا الأسئلة على راحتكم.'}</p>
        <div className="actions">
          <button type="button" className="button" disabled={busy} onClick={next}>
            {acceptInvite ? 'عرض الدعوة' : ongoing ? 'متابعة الجلسة' : 'ابدأ جلسة تعارف'}
          </button>
          {sessions.length > 0 && <button type="button" className="button secondary" disabled={busy} onClick={browse}>كل جلساتي</button>}
        </div>
      </div>
    </section>
    <div className="dashboard-grid journey-home-cards">
      <section className="card"><h2>كيف بتتم الجلسة؟</h2>
        <ol className="journey-guide">
          <li><strong>الدعوة</strong><span>أنشئ جلسة وأرسل رابط الدعوة للطرف الآخر.</span></li>
          <li><strong>الإجابة</strong><span>اختَر محورًا وجاوب بشكل خاص، حتى قبل انضمام الطرف الآخر.</span></li>
          <li><strong>الحوار</strong><span>بعد موافقتكما على مشاركة المحور، بتفتح المقارنة وبتقدروا تسجّلوا اتفاقاتكم.</span></li>
        </ol>
      </section>
      {editProfile && <section className="card"><h2>ملفي الشخصي</h2>
        <p className="muted">بتقدر تضيف معلوماتك أو تعدّلها في أي وقت. داخل كل جلسة بتختار بنفسك شو تشارك.</p>
        <button type="button" className="button secondary" disabled={busy} onClick={editProfile}>{name ? 'فتح ملفي الشخصي' : 'تعديل معلوماتي'}</button>
      </section>}
    </div>
  </>;
}

export function JourneySessions({ sessions, busy, openSession, start, acceptInvite }: SessionListProps & { start: () => void; acceptInvite?: () => void }) {
  return <>
    <section className="dashboard-heading journey-heading"><h1>جلسات التعارف</h1>
      <div className="actions">
        {acceptInvite && <button type="button" className="button secondary" disabled={busy} onClick={acceptInvite}>عرض الدعوة</button>}
        <button type="button" className="button" disabled={busy} onClick={start}>جلسة جديدة</button>
      </div>
    </section>
    {sessions.length ? <ul className="session-list">
      {sessions.map(session => <li key={session.id}><button type="button" disabled={busy} onClick={() => openSession(session.id)}>
        <strong>{session.title} · {session.alias}</strong><small>{sessionState(session)}</small>
      </button></li>)}
    </ul> : <section className="card"><h2>ما عندك جلسات بعد</h2><p className="muted">بتظهر جلستك هون بعد إنشائها أو قبول الدعوة.</p></section>}
  </>;
}

export function JourneyStart({ mode, name, email, busy, save, back, dismiss }: {
  mode: 'new' | 'invite'; name?: string; email: string; busy: boolean; save: (alias: string) => void; back: () => void; dismiss: () => void;
}) {
  const invited = mode === 'invite';
  return <div className="journey-narrow">
    <button type="button" className="plain back" disabled={busy} onClick={back}>→ العودة إلى جلساتي</button>
    <section className="card">
      <h1>{invited ? 'قبول الدعوة' : 'جلسة تعارف جديدة'}</h1>
      <p className="muted">{invited ? 'اختَر الاسم اللي رح يشوفه الطرف اللي دعاك.' : 'بعد إنشاء الجلسة بتقدر تدعو الطرف الآخر أو تبدأ بالإجابة.'}</p>
      {invited && <p className="small">الحساب الحالي <bdi>{email}</bdi></p>}
      <form onSubmit={event => { event.preventDefault(); save(String(new FormData(event.currentTarget).get('alias'))); }}>
        <label>اسمك الظاهر للطرف الآخر<input name="alias" required maxLength={60} autoComplete="nickname" defaultValue={name} /></label>
        <div className="actions">
          <button className="button" disabled={busy}>{invited ? 'قبول الدعوة' : 'إنشاء الجلسة'}</button>
          {invited && <button type="button" className="plain" disabled={busy} onClick={dismiss}>إزالة الدعوة</button>}
        </div>
      </form>
    </section>
  </div>;
}
