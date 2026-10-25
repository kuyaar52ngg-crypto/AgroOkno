import type { ReactNode } from 'react';

import { describeError } from '../api/errors';
import type { ApiError } from '../api/errors';
import { Button } from './Button';
import { Icon } from './Icons';

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Загрузка" />;
}

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export function Alert({ tone = 'info', title, children, action }: { tone?: AlertTone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={20} className="alert__icon" />
      <div className="alert__body">
        {title ? <strong className="alert__title">{title}</strong> : null}
        {children ? <div className="alert__text">{children}</div> : null}
      </div>
      {action ? <div className="alert__action">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state__icon state__icon--muted">
        <Icon name="search" size={24} />
      </div>
      <h3>{title}</h3>
      {children ? <p className="muted small">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, action }: { error: ApiError; onRetry?: () => void; action?: ReactNode }) {
  const { title, message } = describeError(error);
  return (
    <div className="state" role="alert">
      <div className="state__icon state__icon--error">
        <Icon name={error.kind === 'forbidden' ? 'lock' : 'alert'} size={24} />
      </div>
      <h3>{title}</h3>
      <p className="muted small">{message}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        {onRetry && error.kind !== 'forbidden' ? (
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}

/** Плашка при долгом ответе: Render-сервер после простоя просыпается до минуты. */
export function WakeNotice() {
  return (
    <Alert tone="info" title="Сервер просыпается">
      Ответ идёт дольше обычного — после простоя сервер запускается до минуты. Подождите, страница обновится сама.
    </Alert>
  );
}
