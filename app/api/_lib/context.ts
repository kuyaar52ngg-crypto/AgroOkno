/// <reference types="node" />
// Общий код серверных функций: авторизация пользователя, Supabase-клиент от его имени (RLS),
// загрузка данных хозяйства в формат мапперов, единый формат ошибок на русском.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Farm, FormCode } from '../../src/data/contract';
import type { FarmData, HorriotInfo } from '../../src/reports/types';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorResponse = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Любое исключение → JSON-ответ с русским сообщением. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.status, e.message);
    console.error(e);
    return errorResponse(500, 'Внутренняя ошибка сервера. Попробуйте ещё раз');
  }
}

/** Токен пользователя: заголовок Authorization: Bearer … или ?access_token= (для ссылок на скачивание). */
export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = new URL(request.url).searchParams.get('access_token');
  if (query) return query;
  throw new ApiError(401, 'Требуется авторизация');
}

export function userClient(token: string): SupabaseClient {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError(500, 'Сервер не настроен: нет ключей Supabase');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parsePeriod(url: URL): { year: number; month?: number } {
  const year = Number(url.searchParams.get('year'));
  const monthParam = url.searchParams.get('month');
  const month = monthParam ? Number(monthParam) : undefined;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, 'Некорректный год отчётного периода');
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new ApiError(400, 'Некорректный месяц отчётного периода');
  }
  return { year, month };
}

export function parseFarmId(url: URL): string {
  const farmId = url.searchParams.get('farm_id') ?? '';
  if (!UUID_RE.test(farmId)) throw new ApiError(400, 'Не указано хозяйство (farm_id)');
  return farmId;
}

export async function selectAll<T>(supabase: SupabaseClient, table: string, columns: string, farmId: string): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .range(from, from + page - 1);
    if (error) throw new ApiError(500, `Не удалось прочитать данные (${table}): ${error.message}`);
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Сведения демо-«Хорриота». Ошибки не фатальны (например, миграция v3 ещё не применена): тогда undefined,
 * чтобы выписка и остальные отчёты продолжали работать.
 */
export async function loadHorriot(supabase: SupabaseClient, farmId: string): Promise<HorriotInfo | undefined> {
  try {
    const { data: conn, error } = await supabase.from('horriot_connections').select('status, synced_at, deleted_at').eq('farm_id', farmId).maybeSingle();
    if (error) return undefined;
    const records = await selectAll<Record<string, unknown>>(supabase, 'horriot_records', 'kind, animal_group, heads, registered_on, source_movement_id', farmId);
    const connected = conn && !conn.deleted_at && conn.status === 'connected_demo';
    return {
      status: connected ? 'connected_demo' : 'not_connected',
      synced_at: connected ? ((conn.synced_at as string | null) ?? null) : null,
      records: records.map((r) => ({
        kind: r.kind as HorriotInfo['records'][number]['kind'],
        animal_group: r.animal_group as HorriotInfo['records'][number]['animal_group'],
        heads: Number(r.heads),
        registered_on: r.registered_on as string,
        source_movement_id: (r.source_movement_id as string | null) ?? null,
      })),
    };
  } catch {
    return undefined;
  }
}

/** Загружает данные хозяйства от имени пользователя; RLS не отдаст чужое хозяйство. */
export async function loadFarmData(supabase: SupabaseClient, farmId: string, options: { horriot?: boolean } = {}): Promise<FarmData> {
  const { data: farm, error } = await supabase.from('farms').select('*').eq('id', farmId).is('deleted_at', null).maybeSingle();
  if (error) throw new ApiError(500, `Не удалось прочитать хозяйство: ${error.message}`);
  if (!farm) throw new ApiError(404, 'Хозяйство не найдено или нет доступа');

  const [movements, outputs, sales, feed, crops, members, submissions] = await Promise.all([
    selectAll<Record<string, unknown>>(supabase, 'livestock_movements', 'id, occurred_on, animal_group, kind, heads, live_weight_kg, amount_rub', farmId),
    selectAll<Record<string, unknown>>(supabase, 'product_outputs', 'occurred_on, product, quantity, source_group', farmId),
    selectAll<Record<string, unknown>>(supabase, 'product_sales', 'occurred_on, product, quantity, amount_rub', farmId),
    selectAll<Record<string, unknown>>(supabase, 'feed_events', 'occurred_on, feed, operation, quantity_t', farmId),
    selectAll<Record<string, unknown>>(supabase, 'crop_events', 'occurred_on, plot_name, crop, operation, area_ha, yield_t', farmId),
    selectAll<Record<string, unknown>>(supabase, 'household_members', 'full_name, is_head', farmId),
    selectAll<Record<string, unknown>>(
      supabase,
      'report_submissions',
      'form_code, period_year, period_month, status, recipient, receipt_no, submitted_at, snapshot',
      farmId,
    ),
  ]);

  const horriot = options.horriot ? await loadHorriot(supabase, farmId) : undefined;

  return {
    farm: farm as unknown as Farm,
    movements: movements.map((m) => ({
      id: m.id as string,
      occurred_on: m.occurred_on as string,
      animal_group: m.animal_group as FarmData['movements'][number]['animal_group'],
      kind: m.kind as FarmData['movements'][number]['kind'],
      heads: Number(m.heads),
      live_weight_kg: num(m.live_weight_kg),
      amount_rub: num(m.amount_rub),
    })),
    outputs: outputs.map((o) => ({ ...(o as object), quantity: Number(o.quantity) }) as FarmData['outputs'][number]),
    sales: sales.map((s) => ({ ...(s as object), quantity: Number(s.quantity), amount_rub: num(s.amount_rub) }) as FarmData['sales'][number]),
    feed: feed.map((f) => ({ ...(f as object), quantity_t: Number(f.quantity_t) }) as FarmData['feed'][number]),
    crops: crops.map((c) => ({ ...(c as object), area_ha: Number(c.area_ha), yield_t: num(c.yield_t) }) as FarmData['crops'][number]),
    members: members as unknown as FarmData['members'],
    submissions: submissions as unknown as FarmData['submissions'],
    ...(horriot ? { horriot } : {}),
  };
}

/** Сегодня в часовом поясе хозяйства (Якутск, UTC+9). */
export function todayInYakutsk(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function xlsxResponse(file: Buffer, name: string): Response {
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const FORM_FILE_PREFIX: Record<FormCode, string> = {
  '3-fermer': '3-fermer',
  '3-fermer-month': '3-fermer',
  '1-fermer': '1-fermer',
  '2-fermer': '2-fermer',
  '1-kfh': '1-kfh',
  '1-ip': '1-ip',
  '1-tabun': '1-tabun',
  '10-sh': '10-sh',
  '1-iso-r': '1-iso-r',
};
