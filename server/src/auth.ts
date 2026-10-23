// Аутентификация: Bearer access_token Supabase проверяется через auth.getUser; клиент БД создаётся от имени пользователя (RLS).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';

import type { Deps } from './deps';
import { HttpError } from './errors';

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

export function requireUser(deps: Deps) {
  return async (req: FastifyRequest): Promise<void> => {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'Требуется авторизация', 'unauthorized');
    let user;
    try {
      user = await deps.supabase.verify(token);
    } catch {
      throw new HttpError(503, 'Сервис авторизации недоступен. Попробуйте позже', 'auth_unavailable');
    }
    if (!user) throw new HttpError(401, 'Сессия истекла. Войдите заново', 'unauthorized');
    req.user = user;
    req.token = token;
  };
}

/** Клиент Supabase текущего пользователя (после requireUser). */
export const userDb = (deps: Deps, req: FastifyRequest): SupabaseClient => deps.supabase.forUser(req.token!);
