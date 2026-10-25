import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './States';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  /** Подпись на время загрузки («Сохраняем…»). */
  loadingLabel?: string;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading = false, loadingLabel, icon, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <Spinner size={16} /> : icon}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" {...rest} className={['icon-btn', className ?? ''].filter(Boolean).join(' ')} aria-label={label} title={label}>
      {children}
    </button>
  );
}
