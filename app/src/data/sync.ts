// Синхронизация локальной БД с Supabase.
//  • Запись: документы с pending = 1 отправляются upsert-ом по id (клиентские uuid), при ошибке остаются в очереди.
//  • Чтение: pull по updated_at >= last_pulled_at для каждой таблицы; мягкие удаления применяются локально.
//  • Конфликты: несинхронизированная локальная правка не затирается pull-ом; после отправки побеждает серверная версия.
import { captureError } from '../lib/monitoring';
import { supabase } from '../lib/supabase';
import { applyDeadlineOverrides } from '../reports/deadlines';
import { emitChange } from './bus';
import { isNetworkError, lastSyncedAt, markSynced, net, setLastError, setOnline, setSyncing } from './net';
import { applyServerRows, clearPending, getDoc, getMeta, pendingDocs, setMeta, type Doc, type Row } from './store';

export interface TableDef {
  name: string;
  /** Колонка первичного ключа. */
  key: string;
  /** Отправлять ли локальные изменения на сервер. */
  push: boolean;
  /** Таблица новой миграции: если её ещё нет на сервере, синхронизация остальных таблиц не ломается. */
  optional?: boolean;
}

/** Порядок важен: родительские таблицы раньше дочерних (внешние ключи). */
export const TABLES: TableDef[] = [
  { name: 'profiles', key: 'id', push: true },
  { name: 'farms', key: 'id', push: true },
  { name: 'farm_join_requests', key: 'id', push: false },
  { name: 'household_members', key: 'id', push: true },
  { name: 'livestock_movements', key: 'id', push: true },
  { name: 'product_outputs', key: 'id', push: true },
  { name: 'product_sales', key: 'id', push: true },
  { name: 'feed_events', key: 'id', push: true },
  { name: 'crop_events', key: 'id', push: true },
  { name: 'report_submissions', key: 'id', push: false },
  { name: 'mercury_connections', key: 'farm_id', push: true },
  { name: 'mercury_documents', key: 'id', push: true },
  { name: 'horriot_connections', key: 'farm_id', push: true, optional: true },
  { name: 'horriot_records', key: 'id', push: true, optional: true },
  { name: 'notifications', key: 'id', push: true },
  { name: 'user_settings', key: 'user_id', push: true },
  { name: 'support_tickets', key: 'id', push: true },
  { name: 'chat_messages', key: 'id', push: true },
];

export const tableDef = (name: string): TableDef => TABLES.find((t) => t.name === name)!;

const PAGE = 1000;
let currentUserId: string | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let backoffUntil = 0;
let failures = 0;
const hooks: (() => void)[] = [];

/** Колбэки после успешного pull (например, генерация напоминаний). */
export const onPulled = (fn: () => void) => {
  hooks.push(fn);
};

export function setSyncUser(userId: string | null): void {
  currentUserId = userId;
}

function stripForPush(doc: Doc): Row {
  const { updated_at: _ignored, ...rest } = doc.data;
  void _ignored;
  return rest;
}

async function pushTable(def: TableDef): Promise<void> {
  const batch = pendingDocs().filter((d) => d.tbl === def.name);
  if (batch.length === 0) return;
  const send = async (docs: Doc[]) => {
    const { data, error } = await supabase
      .from(def.name)
      .upsert(docs.map(stripForPush), { onConflict: def.key })
      .select();
    if (error) throw error;
    return (data ?? []) as Row[];
  };
  const finalize = (docs: Doc[], serverRows: Row[]) => {
    const unchanged = docs.filter((d) => getDoc(d.tbl, d.id) === d);
    const byId = new Map(serverRows.map((r) => [String(r[def.key]), r]));
    for (const d of unchanged) {
      const server = byId.get(d.id);
      if (server) applyServerRows(def.name, def.key, [server], { force: true });
      else clearPending(d.tbl, d.id);
    }
  };
  try {
    finalize(batch, await send(batch));
  } catch (e) {
    if (isNetworkError(e)) throw e;
    // Пакет отклонён сервером — пробуем по одной, чтобы одна плохая запись не блокировала остальные.
    let lastError: unknown = e;
    for (const doc of batch) {
      try {
        finalize([doc], await send([doc]));
      } catch (single) {
        if (isNetworkError(single)) throw single;
        lastError = single;
        console.warn(`[sync] ${def.name}/${doc.id} отклонена сервером:`, (single as { message?: string }).message ?? single);
      }
    }
    if (pendingDocs().some((d) => d.tbl === def.name)) setLastError(String((lastError as { message?: string })?.message ?? lastError));
  }
}

async function pullTable(def: TableDef): Promise<void> {
  const metaKey = `pull:${def.name}`;
  const since = getMeta(metaKey);
  let maxSeen = since;
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(def.name).select('*').order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
    if (since) query = query.gte('updated_at', since);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    applyServerRows(def.name, def.key, rows);
    for (const r of rows) if (r.updated_at && (!maxSeen || r.updated_at > maxSeen)) maxSeen = r.updated_at;
    if (rows.length < PAGE) break;
  }
  if (maxSeen && maxSeen !== since) setMeta(metaKey, maxSeen);
}

/** Таблицы нет в схеме сервера (миграция ещё не применена) — PostgREST PGRST205 или Postgres 42P01. */
const isMissingTable = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42P01';
};

async function guardOptional(def: TableDef, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    if (def.optional && isMissingTable(e)) {
      console.warn(`[sync] таблицы ${def.name} нет на сервере — пропускаем до применения миграции`);
      return;
    }
    throw e;
  }
}

const DEADLINES_META = 'report_deadlines';

/** Сроки из кеша прошлой синхронизации — чтобы правки админ-панели действовали и офлайн. */
export function applyCachedDeadlines(): void {
  try {
    const cached = getMeta(DEADLINES_META);
    if (cached) applyDeadlineOverrides(JSON.parse(cached) as Row[]);
  } catch {
    // повреждённый кеш — остаются встроенные сроки
  }
}

/** Справочник сроков (9 строк, без updated_at) читается целиком; правки админ-панели накладываются на встроенные сроки. */
async function pullDeadlines(): Promise<void> {
  const { data, error } = await supabase.from('report_deadlines').select('*');
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const json = JSON.stringify(rows);
  if (json === getMeta(DEADLINES_META)) return;
  setMeta(DEADLINES_META, json);
  if (applyDeadlineOverrides(rows) > 0) emitChange();
}

/**
 * Одна полная синхронизация: сначала отправка очереди (последовательно — из-за внешних ключей),
 * затем получение изменений всех таблиц параллельно: курсоры у таблиц независимые, а 18 запросов
 * по очереди на первом входе занимали несколько секунд.
 */
async function runOnce(): Promise<void> {
  for (const def of TABLES) if (def.push) await guardOptional(def, () => pushTable(def));
  await Promise.all([...TABLES.map((def) => guardOptional(def, () => pullTable(def))), pullDeadlines()]);
}

export function syncNow(options: { force?: boolean } = {}): Promise<void> {
  if (!currentUserId) return Promise.resolve();
  if (running) {
    rerun = true;
    return running;
  }
  if (!options.force && Date.now() < backoffUntil) return Promise.resolve();
  running = (async () => {
    setSyncing(true);
    try {
      do {
        rerun = false;
        await runOnce();
      } while (rerun);
      failures = 0;
      backoffUntil = 0;
      setOnline(true);
      setLastError(null);
      markSynced(new Date().toISOString());
      hooks.forEach((fn) => fn());
    } catch (e) {
      failures += 1;
      backoffUntil = Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5));
      if (isNetworkError(e)) setOnline(false);
      else {
        setOnline(true);
        setLastError(String((e as { message?: string })?.message ?? e));
        if (failures === 1) captureError(e, 'sync'); // только первая ошибка серии, без повторов на каждом ретрае
      }
    } finally {
      running = null;
      setSyncing(false);
      emitChange();
    }
  })();
  return running;
}

/** Отправка после локальной записи (с небольшой задержкой, чтобы объединять быстрые правки). */
export function requestSync(delayMs = 800): void {
  if (!currentUserId) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow();
  }, delayMs);
}

/** Принудительная повторная попытка (кнопка «Повторить»): сбрасывает паузу после ошибок. */
export function retrySync(): Promise<void> {
  failures = 0;
  backoffUntil = 0;
  return syncNow({ force: true });
}

export { lastSyncedAt, net };
