import { useEffect, useEffectEvent, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './Button';
import { Icon } from './Icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** modal — по центру, drawer — панель справа. */
  variant?: 'modal' | 'drawer';
  /** Запретить закрытие (идёт сохранение). */
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/** Диалог/панель: портал, Esc, возврат фокуса, ловушка Tab, блокировка прокрутки страницы. */
export function Overlay({ open, title, onClose, children, footer, variant = 'modal', busy = false, size = 'md' }: OverlayProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // для обработчиков кликов; в эффекте клавиатуры — отдельный effect event
  const requestClose = () => {
    if (!busy) onClose();
  };
  const closeFromKey = useEffectEvent(() => {
    if (!busy) onClose();
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeFromKey();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0] as HTMLElement;
      const lastEl = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`overlay overlay--${variant}`}>
      <div className="overlay__scrim" onClick={requestClose} aria-hidden="true" />
      <div ref={panelRef} className={`overlay__panel overlay__panel--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="overlay__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Закрыть" onClick={requestClose} disabled={busy}>
            <Icon name="close" size={20} />
          </IconButton>
        </header>
        <div className="overlay__body">{children}</div>
        {footer ? <footer className="overlay__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
