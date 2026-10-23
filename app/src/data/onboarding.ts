// Онбординг после входа (R3–R8): шаг, создание хозяйства, поиск по коду/ИНН, запрос доступа.
// Всё через RPC Supabase (create_farm, find_farm, request_farm_access) — без обязательного Node-сервера.
import { supabase } from '../lib/supabase';
import type { Farm, FarmLookup, JoinRequest, NewFarmInput, OnboardingStep } from './contract';
import { currentProfile, toFarm } from './entities';
import { isNetworkError, setOnline } from './net';
import { currentFarmRow, currentUserId, session } from './session';
import { applyServerRows, rows, type Row } from './store';
import { syncNow } from './sync';

const NETWORK_MESSAGE = 'Нет подключения к сети. Проверьте интернет и попробуйте ещё раз';

/** Ошибка RPC → понятное сообщение (тексты ошибок БД уже на русском). */
function rpcError(e: { message?: string } | unknown): Error {
  if (isNetworkError(e)) {
    setOnline(false);
    return new Error(NETWORK_MESSAGE);
  }
  const message = (e as { message?: string } | null)?.message;
  return new Error(message && /[А-Яа-яЁё]/.test(message) ? message : 'Не удалось выполнить запрос. Попробуйте ещё раз');
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function toJoinRequest(r: Row): JoinRequest {
  return {
    id: String(r.id),
    farm_id: String(r.farm_id),
    farm_name: String(r.farm_name),
    settlement: str(r.farm_settlement),
    status: r.status as JoinRequest['status'],
    contact: str(r.contact),
    created_at: String(r.created_at),
  };
}

/** Мой актуальный запрос доступа: ожидающий, иначе последний. */
export function currentJoinRequest(): JoinRequest | null {
  const me = currentUserId();
  const mine = rows('farm_join_requests')
    .filter((r) => r.user_id === me)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const row = mine.find((r) => r.status === 'pending') ?? mine[0];
  return row ? toJoinRequest(row) : null;
}

/** role → farm → pending_access → null. */
export function onboardingStepNow(): OnboardingStep {
  if (session.status !== 'signed_in') return null;
  const profile = currentProfile();
  if (!profile) return null;
  if (!profile.role) return 'role';
  if (currentFarmRow()) return null;
  return currentJoinRequest()?.status === 'pending' ? 'pending_access' : 'farm';
}

const INN_RE = /^(\d{10}|\d{12})$/;

/** R5: создаёт хозяйство (требуется сеть). Для ЛПХ сервер заводит запись книги и главу хозяйства. */
export async function createFarm(input: NewFarmInput): Promise<Farm> {
  const name = input.name.trim();
  if (!name) throw new Error('Укажите название хозяйства');
  const inn = (input.inn ?? '').replace(/\s+/g, '');
  if (input.legal_status !== 'lph' && !inn) throw new Error('Укажите ИНН хозяйства');
  if (inn && !INN_RE.test(inn)) throw new Error('ИНН — 10 или 12 цифр');
  const { data, error } = await supabase.rpc('create_farm', {
    p_name: name,
    p_legal_status: input.legal_status,
    p_region: input.region.trim(),
    p_settlement: input.settlement.trim(),
    p_inn: inn || null,
  });
  if (error) throw rpcError(error);
  setOnline(true);
  const row = data as unknown as Row;
  applyServerRows('farms', 'id', [row], { force: true });
  void syncNow({ force: true });
  return toFarm(row);
}

/** R7: поиск хозяйства по коду приглашения (AGRO-0142) или ИНН. null — не найдено. */
export async function findFarm(codeOrInn: string): Promise<FarmLookup | null> {
  const q = codeOrInn.trim();
  if (q.length < 3) throw new Error('Введите код приглашения (например, AGRO-0142) или ИНН');
  const { data, error } = await supabase.rpc('find_farm', { p_query: q });
  if (error) throw rpcError(error);
  setOnline(true);
  const row = (data as unknown as { farm_id: string; name: string; region: string | null; settlement: string | null }[] | null)?.[0];
  return row ? { farm_id: row.farm_id, name: row.name, region: row.region, settlement: row.settlement } : null;
}

/** R7 → R8: отправить запрос доступа владельцу хозяйства. */
export async function requestAccess(farmId: string): Promise<JoinRequest> {
  const { data, error } = await supabase.rpc('request_farm_access', { p_farm_id: farmId });
  if (error) throw rpcError(error);
  setOnline(true);
  const row = data as unknown as Row;
  applyServerRows('farm_join_requests', 'id', [row], { force: true });
  return toJoinRequest(row);
}
