import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Logo } from '../layout/AppLayout';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';
import { Spinner } from '../ui/States';
import { describeError } from '../api/errors';
import { useAuth } from './AuthContext';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--center">
        <Logo />
        {children}
      </div>
    </div>
  );
}

/** Охрана разделов: нет сессии — на вход; не администратор — «Нет доступа»; сбой проверки — повтор. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { phase, error, signOut, recheck } = useAuth();
  const location = useLocation();

  if (phase === 'loading' || phase === 'checking') {
    return (
      <Centered>
        <Spinner size={28} />
        <p className="muted small">{phase === 'loading' ? 'Загрузка…' : 'Проверяем права доступа…'}</p>
      </Centered>
    );
  }
  if (phase === 'signed_out') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (phase === 'denied') {
    return (
      <Centered>
        <div className="state__icon state__icon--error">
          <Icon name="lock" size={24} />
        </div>
        <h1 className="auth-title">Нет доступа</h1>
        <p className="muted">Панель доступна только администраторам АгроОкно. Войдите под учётной записью администратора.</p>
        <Button onClick={() => void signOut()}>Выйти</Button>
      </Centered>
    );
  }
  if (phase === 'error') {
    const info = error ? describeError(error) : { title: 'Не удалось проверить права', message: 'Повторите попытку.' };
    return (
      <Centered>
        <div className="state__icon state__icon--error">
          <Icon name="alert" size={24} />
        </div>
        <h1 className="auth-title">Не удалось проверить права</h1>
        <p className="muted">{info.message}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button onClick={recheck}>Повторить</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Выйти
          </Button>
        </div>
      </Centered>
    );
  }
  return <>{children}</>;
}
