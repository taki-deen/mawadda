import { useEffect, useState, type FormEvent } from 'react';
import type { AdminStats, ContentDraft, ContentView, CustomField } from './adminTypes';
import type { ProfileApi } from './androidProfiles';
import { manualOnlyQuestionIds, type Question } from './types';

type Run = (work: () => Promise<void>) => void;
const kinds = { text: 'نص قصير', number: 'رقم', choice: 'قائمة خيارات' } as const;
const actions: Record<string, string> = {
  save_draft: 'حفظ المسودة',
  publish: 'نشر الإصدار', archive_question: 'أرشفة سؤال من النسخة القادمة', delete_question: 'حذف سؤال من المسودة',
  archive_field: 'أرشفة حقل من النسخة القادمة', delete_field: 'حذف حقل من المسودة',
};
const cleanOptions = (value: FormDataEntryValue | null) => String(value ?? '').split(/\r?\n/).map(option => option.trim()).filter(Boolean);

function moveItem<Item>(items: Item[], position: number, offset: number) {
  const ordered = [...items];
  const next = position + offset;
  [ordered[position], ordered[next]] = [ordered[next], ordered[position]];
  return ordered;
}

function Dashboard({ api }: { api: ProfileApi }) {
  const [stats, setStats] = useState<AdminStats>();
  const [query, setQuery] = useState({ version: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    let ignore = false;
    api<AdminStats>(`/admin/dashboard?${params}`).then(value => {
      if (!ignore) { setStats(value); setLoading(false); }
    }).catch(error => { if (!ignore) { setError(error.message); setLoading(false); } });
    return () => { ignore = true; };
  }, [api, query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setLoading(true); setError('');
    setQuery({ version: String(fields.get('version') ?? ''), from: String(fields.get('from') ?? ''), to: String(fields.get('to') ?? '') });
  };

  return <section className="card">
    <h2>إحصائيات مَوَدّة</h2>
    <form className="studio-filters" onSubmit={submit}>
      <label>من تاريخ<input name="from" type="date" /></label>
      <label>إلى تاريخ<input name="to" type="date" /></label>
      <label>إصدار الاستبيان<select key={stats?.selectedVersion} name="version" defaultValue={stats?.selectedVersion ?? ''}>
        {!stats && <option value="">الإصدار المنشور</option>}
        {stats?.versions.map(version => <option key={version.id} value={version.id}>الإصدار {version.number}</option>)}
      </select></label>
      <button className="button secondary" disabled={loading}>تطبيق الفلتر</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {loading && <p role="status">جارٍ تحميل الإحصائيات…</p>}
    {stats && !loading && !error && <>
      <dl className="studio-metrics">
        <div><dt>حسابات جديدة</dt><dd>{stats.accounts}</dd></div>
        <div><dt>جلسات بدأت</dt><dd>{stats.sessions}</dd></div>
        <div><dt>دعوات مقبولة</dt><dd>{stats.joined}</dd></div>
        <div><dt>جلسات وصلت للمقارنة</dt><dd>{stats.comparisons}</dd></div>
      </dl>
      <p className="muted small">التاريخ يفلتر وقت إنشاء الحساب أو الجلسة. إصدار الاستبيان يفلتر مؤشرات الجلسات.</p>
      <h3>إكمال المحاور</h3>
      <p className="muted small">يكتمل المحور لما يجاوب الطرفان عن كل أسئلته. النسبة من الجلسات التي بدأ فيها طرف واحد على الأقل.</p>
      <ul className="studio-progress">{stats.categories.map(item => <li key={item.title}>
        <span>{item.title}</span><span>{item.started ? `${Math.round(item.completed * 100 / item.started)}٪ · ${item.completed} من ${item.started}` : 'ما حدا بدأ بعد'}</span>
        <progress aria-label={item.title} value={item.completed} max={item.started || 1} />
      </li>)}</ul>
    </>}
  </section>;
}

function QuestionEditor({ question, onSave, onCancel }: { question: Question; onSave: (question: Question) => void; onCancel: () => void }) {
  const [choice, setChoice] = useState(Boolean(question.options));
  return <form className="studio-item-form" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave({ ...question, text: String(fields.get('text') ?? '').trim(), options: choice ? cleanOptions(fields.get('options')) : null,
      auto: choice && fields.get('auto') === 'on' });
  }}>
    <label>نص السؤال<textarea name="text" required maxLength={600} defaultValue={question.text} /></label>
    <label>نوع السؤال<select value={choice ? 'choice' : 'text'} onChange={event => setChoice(event.target.value === 'choice')}>
      <option value="text">إجابة مفتوحة</option><option value="choice">اختيار من قائمة</option>
    </select></label>
    {choice && <>
      <label>الخيارات (خيار بكل سطر)<textarea name="options" required rows={4} defaultValue={question.options?.join('\n')} /></label>
      {manualOnlyQuestionIds.has(question.id) ? <p className="muted small">سؤال إفصاح بتقييم يدوي.</p>
        : <label className="checkbox"><input type="checkbox" name="auto" defaultChecked={question.auto} />تقييم تلقائي عند تطابق الخيار</label>}
    </>}
    <div className="actions"><button className="button secondary">اعتماد التعديل في المسودة</button>
      <button type="button" className="plain" onClick={onCancel}>إلغاء</button></div>
  </form>;
}

function FieldEditor({ field, onSave, onCancel }: { field: CustomField; onSave: (field: CustomField) => void; onCancel: () => void }) {
  const [kind, setKind] = useState(field.kind);
  return <form className="studio-item-form" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave({ ...field, label: String(fields.get('label') ?? '').trim(), kind,
      options: kind === 'choice' ? cleanOptions(fields.get('options')) : [] });
  }}>
    <label>اسم الحقل<input name="label" required maxLength={100} defaultValue={field.label} /></label>
    <label>نوع الحقل<select value={kind} onChange={event => setKind(event.target.value as CustomField['kind'])}>
      {Object.entries(kinds).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
    </select></label>
    {kind === 'choice' && <label>الخيارات (خيار بكل سطر)<textarea name="options" required rows={4} defaultValue={field.options.join('\n')} /></label>}
    <div className="actions"><button className="button secondary">اعتماد التعديل في المسودة</button>
      <button type="button" className="plain" onClick={onCancel}>إلغاء</button></div>
  </form>;
}

export function AdminStudio({ api, busy, run, onMessage }: { api: ProfileApi; busy: boolean; run: Run; onMessage: (message: string) => void }) {
  const [tab, setTab] = useState<'dashboard' | 'questions' | 'fields' | 'history'>('dashboard');
  const [content, setContent] = useState<ContentView>();
  const [draft, setDraft] = useState<ContentDraft>();
  const [dirty, setDirty] = useState(false);
  const [category, setCategory] = useState(0);
  const [questionEdit, setQuestionEdit] = useState<Question>();
  const [fieldEdit, setFieldEdit] = useState<CustomField>();
  const [error, setError] = useState('');
  useEffect(() => {
    let ignore = false;
    api<ContentView>('/admin/content').then(value => {
      if (!ignore) { setContent(value); setDraft(value.draft); }
    }).catch(error => { if (!ignore) setError(error.message); });
    return () => { ignore = true; };
  }, [api]);

  const apply = (next: ContentDraft) => { setDraft(next); setDirty(true); };
  const store = (publish: boolean) => run(async () => {
    if (!content || !draft) return;
    const result = await api<ContentView>(publish ? '/admin/content/publish' : '/admin/content', publish ? 'POST' : 'PUT',
      publish ? { revision: content.revision } : { revision: content.revision, draft });
    setContent(result); setDraft(result.draft); setDirty(false);
    onMessage(publish ? 'نُشرت النسخة المحفوظة.' : 'حُفظت المسودة.');
  });

  const list = draft?.questionnaire.questions.filter(question => question.category === category) ?? [];
  const setQuestions = (questions: Question[]) => {
    if (draft) apply({ ...draft, questionnaire: { ...draft.questionnaire,
      questions: [...draft.questionnaire.questions.filter(question => question.category !== category), ...questions]
        .sort((left, right) => left.category - right.category) } });
  };
  const setFields = (fields: CustomField[]) => { if (draft) apply({ ...draft, fields }); };

  return <section className="admin-studio">
    <h1>لوحة الإدارة</h1>
    <nav className="panels" aria-label="أقسام لوحة الإدارة">
      {([['dashboard', 'الإحصائيات'], ['questions', 'الأسئلة'], ['fields', 'حقول البروفايل'], ['history', 'سجل التغييرات']] as const).map(([key, title]) =>
        <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}
    </nav>
    {tab === 'dashboard' && <Dashboard api={api} />}
    {tab !== 'dashboard' && error && <p className="notice error" role="alert">{error}</p>}
    {tab !== 'dashboard' && !draft && !error && <p role="status">جارٍ تحميل المسودة…</p>}
    {draft && content && (tab === 'questions' || tab === 'fields') && <>
      <div className="card studio-toolbar"><p className="muted">{dirty ? 'في تعديلات بانتظار الحفظ.' : 'التعديلات المحفوظة جاهزة للمعاينة.'}</p>
        <div className="actions"><button type="button" className="button secondary" disabled={busy || !dirty || Boolean(questionEdit || fieldEdit)} onClick={() => store(false)}>حفظ المسودة</button>
          {content.canPublish && <button type="button" className="button" disabled={busy || dirty || Boolean(questionEdit || fieldEdit)} onClick={() => store(true)}>نشر النسخة المحفوظة</button>}</div>
      </div>
      {tab === 'questions' && <section className="card">
        <h2>محرّر الأسئلة</h2>
        <label>المحور<select value={category} onChange={event => { setCategory(Number(event.target.value)); setQuestionEdit(undefined); }}>
          {draft.questionnaire.categories.map((name, index) => <option key={index} value={index}>{name}</option>)}
        </select></label>
        <button type="button" className="button secondary" disabled={busy || Boolean(questionEdit)} onClick={() => setQuestionEdit({
          id: Math.max(content.highestQuestionId, ...draft.questionnaire.questions.map(item => item.id)) + 1, category, text: '', options: null, auto: false,
        })}>إضافة سؤال</button>
        {questionEdit && <QuestionEditor key={questionEdit.id} question={questionEdit} onCancel={() => setQuestionEdit(undefined)} onSave={question => {
          setQuestions(list.some(item => item.id === question.id) ? list.map(item => item.id === question.id ? question : item) : [...list, question]);
          setQuestionEdit(undefined);
        }} />}
        <ol className="studio-items">{list.map((item, index) => <li key={item.id}>
          <strong>{item.text}</strong><small>{item.options ? `${item.options.length} خيارات` : 'إجابة مفتوحة'}</small>
          <div className="actions">
            <button type="button" className="plain" disabled={Boolean(questionEdit)} onClick={() => setQuestionEdit(item)}>تعديل</button>
            <button type="button" className="plain" disabled={index === 0 || Boolean(questionEdit)} onClick={() => setQuestions(moveItem(list, index, -1))}>للأعلى</button>
            <button type="button" className="plain" disabled={index === list.length - 1 || Boolean(questionEdit)} onClick={() => setQuestions(moveItem(list, index, 1))}>للأسفل</button>
            <button type="button" className="plain" disabled={Boolean(questionEdit)} onClick={() => setQuestions(list.filter(question => question.id !== item.id))}>إزالة من المسودة</button>
          </div>
        </li>)}</ol>
        <details className="studio-preview"><summary>معاينة المحور قبل النشر</summary><ol>{list.map(item => <li key={item.id}>
          <strong>{item.text}</strong>{item.options && <ul>{item.options.map((option, index) => <li key={index}>{option}</li>)}</ul>}
        </li>)}</ol></details>
      </section>}
      {tab === 'fields' && <section className="card">
        <h2>حقول البروفايل الإضافية</h2>
        <p className="muted">الحقول المضافة اختيارية وخاصة إلى أن يشاركها صاحب الحساب.</p>
        <button type="button" className="button secondary" disabled={busy || Boolean(fieldEdit)} onClick={() => setFieldEdit({ id: crypto.randomUUID(), label: '', kind: 'text', options: [] })}>إضافة حقل</button>
        {fieldEdit && <FieldEditor key={fieldEdit.id} field={fieldEdit} onCancel={() => setFieldEdit(undefined)} onSave={field => {
          setFields(draft.fields.some(item => item.id === field.id) ? draft.fields.map(item => item.id === field.id ? field : item) : [...draft.fields, field]);
          setFieldEdit(undefined);
        }} />}
        <ul className="studio-items">{draft.fields.map((field, index) => <li key={field.id}>
          <strong>{field.label}</strong><small>{kinds[field.kind]}</small>
          <div className="actions">
            <button type="button" className="plain" disabled={Boolean(fieldEdit)} onClick={() => setFieldEdit(field)}>تعديل</button>
            <button type="button" className="plain" disabled={index === 0 || Boolean(fieldEdit)} onClick={() => setFields(moveItem(draft.fields, index, -1))}>للأعلى</button>
            <button type="button" className="plain" disabled={index === draft.fields.length - 1 || Boolean(fieldEdit)} onClick={() => setFields(moveItem(draft.fields, index, 1))}>للأسفل</button>
            <button type="button" className="plain" disabled={Boolean(fieldEdit)} onClick={() => setFields(draft.fields.filter(item => item.id !== field.id))}>إزالة من المسودة</button>
          </div>
        </li>)}</ul>
        {draft.fields.length > 0 && <details className="studio-preview"><summary>معاينة الحقول قبل النشر</summary>{draft.fields.map(field => <label key={field.id}>
          {field.label}{field.kind === 'choice' ? <select><option>اختياري</option>{field.options.map((option, index) => <option key={index}>{option}</option>)}</select>
            : <input type={field.kind} placeholder="اختياري" />}
        </label>)}</details>}
      </section>}
    </>}
    {tab === 'history' && content && <section className="card"><h2>سجل تغييرات المحتوى</h2>
      {content.events.length === 0 && <p className="muted">ما في تغييرات مسجّلة بعد.</p>}
      <ul className="studio-items">{content.events.map((event, index) => <li key={index}>
        <strong>{actions[event.action] ?? event.action}</strong><span>{event.subject}</span>
        <small>{new Date(event.createdAt).toLocaleString('ar')} · <bdi>{event.actor}</bdi></small>
      </li>)}</ul>
    </section>}
  </section>;
}
