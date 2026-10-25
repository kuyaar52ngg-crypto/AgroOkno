import { createContext, useContext } from 'react';

import type { ApiError } from '../api/errors';
import type { SessionInfo, SignInResult } from '../api/types';

/**
 * loading — читаем сессию; signed_out — нужно войти; checking — проверяем права (is_app_admin);
 * admin — вошёл администратор; denied — не администратор; error — права проверить не удалось.
 */
export type AuthPhase = 'loading' | 'signed_out' | 'checking' | 'admin' | 'denied' | 'error';

export interface AuthValue {
  phase: AuthPhase;
  session: SessionInfo | null;
  /** Реальный email (или имя) администратора для шапки. */
  displayEmail: string;
  error: ApiError | null;
  mock: boolean;
  signIn: (identifier: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** Повторить проверку прав после ошибки сети. */
  recheck: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth вызван вне AuthProvider');
  return value;
}
