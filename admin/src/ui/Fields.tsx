import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { Icon } from './Icons';

interface FieldProps {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
}

function FieldShell({ id, label, hint, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string | null, hint?: ReactNode) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function Input({ label, hint, error, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input id={id} className={`control ${className ?? ''}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...rest} />
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, className, rows = 4, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} rows={rows} className={`control control--area ${className ?? ''}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...rest} />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({ label, hint, error, options, className, ...rest }: FieldProps & { options: readonly SelectOption[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select id={id} className={`control control--select ${className ?? ''}`} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ label, className, ...rest }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className={`checkbox ${className ?? ''}`}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Поле поиска с иконкой (значение и дебаунс — снаружи, см. SearchBox). */
export function SearchInput({ label, ...rest }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input type="search" className="control search__input" aria-label={label} {...rest} />
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Сегментный переключатель (период, вид списка, получатели). */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly SegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`segmented__item${o.value === value ? ' is-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
