import { Link } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';

import type { Tone } from '../lib/labels';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Card({ title, actions, children, flush = false, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title || actions ? (
        <header className="card__head">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className={flush ? 'card__body card__body--flush' : 'card__body'}>{children}</div>
    </section>
  );
}

/** Карточка-показатель: подпись, крупное число, пояснение; с `to` — ссылка на раздел. */
export function StatCard({ label, value, hint, to, tone }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: 'primary' }) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </>
  );
  const cls = `stat${tone === 'primary' ? ' stat--primary' : ''}${to ? ' stat--link' : ''}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function SkeletonBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div className="stack stack--sm" role="status" aria-label="Загрузка">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/** Определения «подпись — значение» для карточек пользователя и хозяйства. */
export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="defs">
      {items.map((it) => (
        <div key={it.label} className="defs__row">
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="page-head">
      {back ? (
        <Link to={back.to} className="page-head__back">
          ← {back.label}
        </Link>
      ) : null}
      <div className="page-head__row">
        <div className="grow">
          <h1>{title}</h1>
          {subtitle ? <p className="muted page-head__sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
    </header>
  );
}
