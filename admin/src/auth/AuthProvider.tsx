import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '../api';
import { toApiError } from '../api/errors';
import type { ApiError } from '../api/errors';
import type { AdminProfile, SessionInfo } from '../api/types';
import { setMonitoringUser } from '../lib/monitoring';
import { displayAdminEmail } from '../lib/users';
import { AuthContext } from './AuthContext';
import type { AuthPhase, AuthValue } from './AuthContext';

interface Check {
  userId: string;
  attempt: number;
  result: 'admin' | 'denied' | ApiError;
  profile: AdminProfile | null;
}

/** Сессия Supabase → проверка прав rpc('is_app_admin') → состояние панели. */
export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined — сессию ещё не прочитали
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = session?.userId ?? null;

  useEffect(() => {
    let alive = true;
    api.auth
      .getSession()
      .then((s) => {
        if (alive) setSession((prev) => (prev === undefined ? s : prev));
      })
      .catch(() => {
        if (alive) setSession((prev) => (prev === undefined ? null : prev));
      });
    const off = api.auth.onChange((s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  // Sentry: только id администратора (без email).
  useEffect(() => {
    setMonitoringUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      let result: Check['result'];
      try {
        result = (await api.auth.isAdmin()) ? 'admin' : 'denied';
      } catch (e) {
        result = toApiError(e);
      }
      // 42501/403 от is_app_admin означает «не администратор», а не сбой
      if (typeof result !== 'string' && result.kind === 'forbidden') result = 'denied';
      const profile = result === 'admin' ? await api.auth.profile(userId).catch(() => null) : null;
      if (alive) setCheck({ userId, attempt, result, profile });
    })();
    return () => {
      alive = false;
    };
  }, [userId, attempt]);

  const signIn = useCallback<AuthValue['signIn']>((identifier, password) => api.auth.signIn(identifier, password), []);
  const signOut = useCallback<AuthValue['signOut']>(async () => {
    await api.auth.signOut();
    setSession(null);
  }, []);
  const recheck = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<AuthValue>(() => {
    const current = check && check.userId === userId && check.attempt === attempt ? check : null;
    let phase: AuthPhase;
    if (session === undefined) phase = 'loading';
    else if (session === null) phase = 'signed_out';
    else if (!current) phase = 'checking';
    else if (current.result === 'admin') phase = 'admin';
    else if (current.result === 'denied') phase = 'denied';
    else phase = 'error';
    return {
      phase,
      session: session ?? null,
      displayEmail: displayAdminEmail(current?.profile ?? null, session?.email ?? null),
      error: current && typeof current.result !== 'string' ? current.result : null,
      mock: api.mock,
      signIn,
      signOut,
      recheck,
    };
  }, [session, check, userId, attempt, signIn, signOut, recheck]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
