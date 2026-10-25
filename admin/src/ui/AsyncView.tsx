import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import type { AsyncState } from '../hooks/useAsync';
import { Button } from './Button';
import { ErrorState, WakeNotice } from './States';

/**
 * Единое отображение состояния загрузки: скелетон, плашка «сервер просыпается», ошибка с повтором, данные.
 * Пока идёт повторная загрузка, прежние данные остаются на экране.
 */
export function AsyncView<T>({ state, skeleton, children, wake = false }: { state: AsyncState<T>; skeleton: ReactNode; children: (data: T) => ReactNode; wake?: boolean }) {
  const { signOut } = useAuth();
  const { data, error, slow, reload } = state;

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={reload}
        action={
          error.kind === 'unauthorized' ? (
            <Button variant="secondary" onClick={() => void signOut()}>
              Войти снова
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (data === undefined) {
    return (
      <div className="stack">
        {slow && wake ? <WakeNotice /> : null}
        {skeleton}
      </div>
    );
  }
  return (
    <>
      {slow && wake ? <WakeNotice /> : null}
      {children(data)}
    </>
  );
}
