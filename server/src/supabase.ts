// Клиенты Supabase: от имени пользователя (RLS) и сервисный (только для cron-напоминаний).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Env } from './env';

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface SupabaseFactory {
  /** Проверяет access_token пользователя; null — токен недействителен. */
  verify(token: string): Promise<AuthUser | null>;
  /** Клиент от имени пользователя: все запросы идут под RLS. */
  forUser(token: string): SupabaseClient;
  /** Сервисный клиент (service_role). Используется только задачей напоминаний. */
  service(): SupabaseClient | null;
}

export function createSupabaseFactory(env: Env): SupabaseFactory {
  const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, opts);
  const cache = new Map<string, { user: AuthUser; until: number }>();
  let service: SupabaseClient | null = null;
  return {
    async verify(token) {
      const hit = cache.get(token);
      if (hit && hit.until > Date.now()) return hit.user;
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data.user) return null;
      const user = { id: data.user.id, email: data.user.email ?? null };
      cache.set(token, { user, until: Date.now() + 30_000 });
      if (cache.size > 500) for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k);
      return user;
    },
    forUser(token) {
      return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        ...opts,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
    service() {
      if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
      service ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
      return service;
    },
  };
}
