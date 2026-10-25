// Защитная нормализация jsonb-ответов RPC: отсутствующие поля получают безопасные значения, чтобы страница не падала.
import type { AdminFarmDetail, AdminStats, AdminUserDetail, Paged } from './types';

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/** `{ total, items }` → Paged; без items — пустой список. */
export function normalizePaged<T>(raw: unknown): Paged<T> {
  const o = obj(raw);
  const items = arr<T>(o.items);
  return { total: o.total === undefined ? items.length : num(o.total), items };
}

export function normalizeStats(raw: unknown): AdminStats {
  const o = obj(raw);
  const by = obj(o.farms_by_status);
  return {
    users_total: num(o.users_total),
    users_new: num(o.users_new),
    farms_total: num(o.farms_total),
    farms_by_status: { kfh: num(by.kfh), ip: num(by.ip), lph: num(by.lph) },
    events_count: num(o.events_count),
    reports_by_form: arr<Obj>(o.reports_by_form).map((r) => ({ form_code: String(r.form_code ?? ''), count: num(r.count) })),
    mercury_connected: num(o.mercury_connected),
    horriot_connected: num(o.horriot_connected),
    assistant_messages: num(o.assistant_messages),
    open_tickets: num(o.open_tickets),
    daily: arr<Obj>(o.daily).map((d) => ({ date: String(d.date ?? ''), events: num(d.events), new_users: num(d.new_users) })),
  };
}

export function normalizeUserDetail(raw: unknown): AdminUserDetail {
  const o = obj(raw);
  const base = o as unknown as AdminUserDetail;
  return {
    ...base,
    is_admin: o.is_admin === true,
    farms_count: num(o.farms_count),
    farms: arr(o.farms),
    tickets: arr(o.tickets),
    events_30d: num(o.events_30d),
  };
}

export function normalizeFarmDetail(raw: unknown): AdminFarmDetail {
  const o = obj(raw);
  const base = o as unknown as AdminFarmDetail;
  return {
    ...base,
    members_count: num(o.members_count),
    reports_submitted: num(o.reports_submitted),
    members: arr(o.members),
    join_requests: arr(o.join_requests),
    submissions: arr(o.submissions),
  };
}
