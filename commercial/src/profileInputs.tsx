import { useId, useRef, useState, type ReactNode } from 'react';
import type { CustomField } from './adminTypes';

type Option = { value: string; label: string; preview?: ReactNode };
const unselected = { value: '', label: 'بدون اختيار' };
export const optionalChoices = (values: readonly string[]) => [...Array.from(new Set(values), value => ({ value, label: value })), unselected];

export function ProfileChoices({ name, label, options, initialValue = '', value, onChange }: {
  name: string; label: string; options: readonly Option[]; initialValue?: string; value?: string; onChange?: (value: string) => void;
}) {
  const photos = options.filter(option => option.preview);
  const labels = options.filter(option => !option.preview);
  const renderOption = (option: Option) => <label key={option.value} className="profile-option">
    <input type="radio" name={name} value={option.value} checked={value === undefined ? undefined : value === option.value}
      defaultChecked={value === undefined ? initialValue === option.value : undefined}
      onChange={onChange ? event => onChange(event.currentTarget.value) : undefined} />
    <span className="profile-option-content">
      {option.preview}
      <span className="profile-option-caption">{option.label}<i aria-hidden="true">✓</i></span>
    </span>
  </label>;

  return <fieldset className="profile-field profile-choice">
    <legend>{label}</legend>
    {photos.length > 0 && <div className="profile-photo-options">{photos.map(renderOption)}</div>}
    {labels.length > 0 && <div className="profile-options">{labels.map(renderOption)}</div>}
  </fieldset>;
}

export function ProfileTextField({ name, label, value, maxLength, required, autoComplete }: {
  name: string; label: string; value?: string; maxLength: number; required?: boolean; autoComplete?: string;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value ?? '');
  return <div className="profile-field profile-text">
    <div className="profile-text-heading"><label htmlFor={id}>{label}</label><small dir="ltr">{text.length}/{maxLength}</small></div>
    <div className="profile-text-controls">
      <input id={id} ref={field} name={name} dir="auto" value={text} maxLength={maxLength} required={required}
        autoComplete={autoComplete} placeholder={required ? undefined : 'اختياري'} onChange={event => setText(event.target.value)} />
      <button type="button" aria-label={`مسح ${label}`} disabled={!text} onClick={() => { setText(''); field.current?.focus(); }}>×</button>
    </div>
  </div>;
}

function finiteNumber(input: string) {
  const value = Number(input);
  return input !== '' && Number.isFinite(value) ? value : undefined;
}

export function ProfileNumberField({ label, name, value, min, max, increment = 1, emptyValue, integer, required, graphic, onValueChange }: {
  label: string; name: string; value?: number; min?: number; max?: number; increment?: number; emptyValue?: number;
  integer?: boolean; required?: boolean; graphic?: (value?: number) => ReactNode; onValueChange?: (value?: number) => void;
}) {
  const id = useId();
  const [input, setInput] = useState(value === undefined ? '' : String(value));
  const current = finiteNumber(input);
  const lower = min ?? -Number.MAX_VALUE;
  const upper = max ?? Number.MAX_VALUE;
  const update = (next: string) => {
    setInput(next);
    onValueChange?.(finiteNumber(next));
  };
  const changeBy = (direction: number) => {
    const next = current === undefined && emptyValue !== undefined ? emptyValue : (current ?? 0) + direction * increment;
    update(String(Math.min(upper, Math.max(lower, next))));
  };
  return <div className="profile-field profile-number">
    <label htmlFor={id}>{label}</label>
    {graphic?.(current)}
    <div className="profile-number-controls" dir="ltr">
      <button type="button" aria-label={`إنقاص ${label}`} disabled={current !== undefined && current <= lower} onClick={() => changeBy(-1)}>↓</button>
      <input id={id} name={name} value={input} type="number" inputMode={integer ? 'numeric' : 'decimal'} min={min} max={max}
        step={integer ? 1 : 'any'} required={required} placeholder="—" onChange={event => update(event.target.value)} />
      <button type="button" aria-label={`زيادة ${label}`} disabled={current !== undefined && current >= upper} onClick={() => changeBy(1)}>↑</button>
    </div>
  </div>;
}

const normalizeSearch = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\p{M}ـ]/gu, '').replace(/ى/g, 'ي').trim();

export function ProfileLookup({ label, searchLabel, placeholder, emptyLabel, name, value, options, onSelect, required }: {
  label: string; searchLabel: string; placeholder: string; emptyLabel: string; name?: string; value: string;
  options: readonly Option[]; onSelect: (value: string) => void; required?: boolean;
}) {
  const [draft, setDraft] = useState({ value, search: '' });
  const search = draft.value === value ? draft.search : '';
  const term = normalizeSearch(search);
  const matches = term ? options.filter(option => normalizeSearch(option.label).includes(term) || normalizeSearch(option.value).startsWith(term)) : options;
  const selected = options.find(option => option.value === value);
  const select = (next: string) => { onSelect(next); setDraft({ value: next, search: '' }); };
  return <div className="profile-field profile-lookup">
    <label>{searchLabel}<input type="search" value={search} placeholder={placeholder} maxLength={80}
      onChange={event => setDraft({ value, search: event.target.value })} onKeyDown={event => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (term && matches.length === 1) select(matches[0].value);
      }} /></label>
    {term && (matches.length ? <ul className="profile-lookup-results" aria-label={searchLabel}>
      {matches.slice(0, 5).map(option => <li key={option.value}><button type="button" onClick={() => select(option.value)}>{option.label}</button></li>)}
    </ul> : <p className="muted small" role="status">ما في خيارات مطابقة للبحث.</p>)}
    <label>{label}<select name={name} required={required} value={value} onChange={event => select(event.target.value)}>
      <option value="">{emptyLabel}</option>
      {selected && !matches.includes(selected) && <option value={selected.value}>{selected.label}</option>}
      {matches.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  </div>;
}

export function CustomProfileField({ field, value }: { field: CustomField; value?: string | number }) {
  const name = `custom:${field.id}`;
  if (field.kind === 'number') return <ProfileNumberField name={name} label={field.label} value={typeof value === 'number' ? value : undefined} />;
  const text = typeof value === 'string' ? value : undefined;
  if (field.kind === 'choice') return <ProfileChoices name={name} label={field.label} options={optionalChoices(field.options)} initialValue={text} />;
  return <ProfileTextField name={name} label={field.label} value={text} maxLength={250} />;
}
