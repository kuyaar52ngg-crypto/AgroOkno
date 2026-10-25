// Реальный слой API: RPC админ-панели (docs/TZ-admin.md §2) через supabase-js и серверные действия (§3) через fetch.
import type { Session } from '@supabase/supabase-js';

import { config } from './config';
import { ApiError, MESSAGES, fromHttp, fromPostgrest, toApiError } from './errors';
import { normalizeFarmDetail, normalizePaged, normalizeStats, normalizeUserDetail } from './normalize';
import { getSupabase } from './supabase';
import type {
  AdminApi,
  AdminAuditEntry,
  AdminBroadcast,
  AdminFarm,
  AdminProfile,
  AdminSubmission,
  AdminTicket,
  AdminUser,
  AssistantModelOption,
  AssistantModelSettings,
  BlockResult,
  BroadcastResult,
  ReportDeadline,
  SessionInfo,
} from './types';
import { looksLikeBrokenInn } from '../lib/login';

/** Render-сервер после простоя просыпается до минуты — ждём дольше. */
const SERVER_TIMEOUT_MS = 90_000;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await getSupabase().rpc(name, args);
  } catch (e) {
    throw toApiError(e);
  }
  if (res.error) throw fromPostgrest({ ...res.error, status: res.status });
  return res.data as T;
}

type Method = 'GET' | 'POST' | 'PUT';

async function server<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (!config.apiUrl) throw new ApiError('unknown', 'Не задан адрес сервера (VITE_API_URL)');
  let token: string | undefined;
  try {
    token = (await getSupabase().auth.getSession()).data.session?.access_token;
  } catch (e) {
    throw toApiError(e);
  }
  if (!token) throw new ApiError('unauthorized', MESSAGES.unauthorized, 401);

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
    });
  } catch (e) {
    throw toApiError(e);
  }
  const text = await res.text().catch(() => '');
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) throw fromHttp(res.status, parsed);
  return parsed as T;
}

const toSession = (s: Session | null): SessionInfo | null => (s ? { userId: s.user.id, email: s.user.email ?? null } : null);

function isNetworkFailure(e: unknown): boolean {
  return toApiError(e).kind === 'network';
}

const fail = (message: string) => ({ ok: false as const, message });
const NETWORK_FAIL = fail('Нет подключения к сети. Проверьте интернет и попробуйте ещё раз');

export const realApi: AdminApi = {
  mock: false,

  auth: {
    async getSession() {
      const { data } = await getSupabase().auth.getSession();
      return toSession(data.session);
    },

    onChange(cb) {
      const { data } = getSupabase().auth.onAuthStateChange((_event, session) => cb(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    /** Вход как в приложении: resolve_login_email (ИНН/email/телефон → технический email) → signInWithPassword. */
    async signIn(identifierRaw, password) {
      const identifier = identifierRaw.trim();
      if (!identifier) return fail('Введите ИНН, email или телефон');
      if (looksLikeBrokenInn(identifier)) return fail('Неверный ИНН. Проверьте цифры');
      if (!password) return fail('Введите пароль');
      try {
        const supabase = getSupabase();
        const { data: email, error: rpcError } = await supabase.rpc('resolve_login_email', { p_identifier: identifier });
        if (rpcError) return isNetworkFailure(rpcError) ? NETWORK_FAIL : fail('Не удалось войти. Попробуйте ещё раз');
        const { error } = await supabase.auth.signInWithPassword({ email: String(email), password });
        if (error) {
          if (isNetworkFailure(error)) return NETWORK_FAIL;
          if (error.status === 400 || /invalid login credentials|not confirmed/i.test(error.message)) return fail('Неверный логин или пароль');
          return fail('Не удалось войти. Попробуйте ещё раз');
        }
        return { ok: true };
      } catch (e) {
        return isNetworkFailure(e) ? NETWORK_FAIL : fail('Не удалось войти. Попробуйте ещё раз');
      }
    },

    async signOut() {
      try {
        await getSupabase().auth.signOut();
      } catch {
        await getSupabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
    },

    /** Права администратора: rpc('is_app_admin') (security definer, по auth.uid()). */
    async isAdmin() {
      return (await rpc<boolean>('is_app_admin')) === true;
    },

    /** Реальный email и имя из profiles (технический email auth.users в шапке не показываем). */
    async profile(userId) {
      try {
        const { data, error } = await getSupabase().from('profiles').select('full_name, email').eq('id', userId).maybeSingle();
        if (error || !data) return null;
        return data as AdminProfile;
      } catch {
        return null;
      }
    },
  },

  stats: async (from, to) => normalizeStats(await rpc('admin_stats', { p_from: from, p_to: to })),

  listUsers: async (p) => normalizePaged<AdminUser>(await rpc('admin_list_users', { p_search: p.search, p_limit: p.limit, p_offset: p.offset })),
  getUser: async (id) => normalizeUserDetail(await rpc('admin_get_user', { p_user_id: id })),
  setAdmin: (id, grant) => rpc<AdminUser>('admin_set_admin', { p_user_id: id, p_grant: grant }),
  blockUser(id, reason) {
    const trimmed = reason?.trim();
    return server<BlockResult>('POST', `/v1/admin/users/${encodeURIComponent(id)}/block`, trimmed ? { reason: trimmed } : {});
  },
  unblockUser(id) {
    return server<BlockResult>('POST', `/v1/admin/users/${encodeURIComponent(id)}/unblock`, {});
  },

  listFarms: async (p) =>
    normalizePaged<AdminFarm>(await rpc('admin_list_farms', { p_search: p.search, p_status: p.status, p_limit: p.limit, p_offset: p.offset })),
  getFarm: async (id) => normalizeFarmDetail(await rpc('admin_get_farm', { p_farm_id: id })),

  listSubmissions: async (p) =>
    normalizePaged<AdminSubmission>(
      await rpc('admin_list_submissions', { p_form: p.form, p_year: p.year, p_search: p.search, p_limit: p.limit, p_offset: p.offset }),
    ),

  /** Справочник сроков читается напрямую: в §2 нет списочного RPC, а RLS report_deadlines открывает чтение авторизованным. */
  async listDeadlines() {
    let res;
    try {
      res = await getSupabase().from('report_deadlines').select('*').order('form_code');
    } catch (e) {
      throw toApiError(e);
    }
    if (res.error) throw fromPostgrest({ ...res.error, status: res.status });
    return (res.data ?? []) as ReportDeadline[];
  },
  updateDeadline: (formCode, patch) => rpc<ReportDeadline>('admin_update_deadline', { p_form_code: formCode, p_patch: patch }),

  listTickets: async (p) =>
    normalizePaged<AdminTicket>(await rpc('admin_list_tickets', { p_status: p.status, p_search: p.search, p_limit: p.limit, p_offset: p.offset })),
  replyTicket: (id, reply, status) => rpc<AdminTicket>('admin_reply_ticket', { p_ticket_id: id, p_reply: reply, p_status: status }),

  /** Рассылка идёт через сервер: он вызывает RPC от имени администратора и отправляет Expo push. */
  broadcast(input) {
    const body: Record<string, unknown> = { title: input.title, body: input.body, target: input.target };
    if (input.target === 'status') body.status = input.status;
    if (input.target === 'farms') body.farm_ids = input.farm_ids ?? [];
    return server<BroadcastResult>('POST', '/v1/admin/broadcasts', body);
  },
  listBroadcasts: async (p) => normalizePaged<AdminBroadcast>(await rpc('admin_list_broadcasts', { p_limit: p.limit, p_offset: p.offset })),

  listAudit: async (p) => normalizePaged<AdminAuditEntry>(await rpc('admin_list_audit', { p_action: p.action, p_limit: p.limit, p_offset: p.offset })),

  assistantSettings: () => server<AssistantModelSettings>('GET', '/v1/admin/assistant-settings'),
  async assistantModels() {
    const res = await server<{ models?: AssistantModelOption[] }>('GET', '/v1/admin/models');
    return Array.isArray(res?.models) ? res.models : [];
  },
  saveAssistantSettings: (s) => server<AssistantModelSettings>('PUT', '/v1/admin/assistant-settings', s),
};
