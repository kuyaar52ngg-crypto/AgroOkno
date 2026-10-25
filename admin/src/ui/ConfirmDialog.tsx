import { useState } from 'react';
import type { ReactNode } from 'react';

import { toApiError } from '../api/errors';
import { Button } from './Button';
import { Overlay } from './Overlay';
import { Alert } from './States';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Подпись кнопки во время выполнения («Блокируем…»). */
  busyLabel?: string;
  tone?: 'danger' | 'primary';
  /** Дополнительные поля формы (например, причина). Подтверждение — только если `canConfirm`. */
  canConfirm?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/** Подтверждение опасного действия: ошибка выполнения остаётся в окне, чтобы можно было повторить. */
export function ConfirmDialog({ open, title, children, confirmLabel, busyLabel, tone = 'danger', canConfirm = true, onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setError(null);
    onCancel();
  };

  return (
    <Overlay
      open={open}
      title={title}
      onClose={cancel}
      busy={busy}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={cancel} disabled={busy}>
            Отмена
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={run} loading={busy} loadingLabel={busyLabel ?? 'Выполняем…'} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        {children}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
    </Overlay>
  );
}
