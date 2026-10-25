import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Logo } from '../layout/AppLayout';
import { validateCredentials } from '../lib/login';
import { Button } from '../ui/Button';
import { Input } from '../ui/Fields';
import { Alert } from '../ui/States';
import { useAuth } from './AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

/** Вход как в приложении: ИНН, email или телефон + пароль. */
export function LoginPage() {
  usePageTitle('Вход');
  const { phase, signIn, mock } = useAuth();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;
  if (phase === 'admin' || phase === 'denied' || phase === 'checking' || phase === 'error') {
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateCredentials(identifier, password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signIn(identifier, password);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Logo />
        <div className="stack stack--sm">
          <h1 className="auth-title">Вход для администраторов</h1>
          <p className="muted small">Войдите так же, как в приложении: ИНН хозяйства, email или телефон и пароль.</p>
        </div>
        {mock ? (
          <Alert tone="info" title="Демо-режим">
            Данные ненастоящие. Подойдут любой логин и пароль; логин «denied» — вход без прав, пароль «wrong» — ошибка входа.
          </Alert>
        ) : null}
        <Input label="ИНН, email или телефон" name="identifier" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
        <Input label="Пароль" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" loading={busy} loadingLabel="Входим…">
          Войти
        </Button>
      </form>
    </div>
  );
}
