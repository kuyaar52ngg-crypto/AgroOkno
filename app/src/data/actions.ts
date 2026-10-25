// Действия пользователя над локальной БД (без React): запись событий, члены хозяйства, настройки,
// Меркурий, отправка отчётов. Каждая запись сразу попадает в локальную БД (pending) и уходит в очередь отправки.
import { accessToken, apiUrl } from '../lib/api';
import { todayIso, nowIso } from '../lib/clock';
import { newId } from '../lib/ids';
import { balanceOn } from '../reports/period';
import { buildObligation } from '../reports/engine';
import { DEADLINES, isMonthly } from '../reports/deadlines';
import { planHorriotSync, type HorriotSource } from '../reports/horriot';
import { planMercurySync, type MercurySource } from '../reports/mercury';
import type {
  Farm,
  FarmUpdate,
  FormCode,
  HouseholdExtract,
  HorriotConnection,
  HouseholdMember,
  JournalEntry,
  MercuryConnection,
  NewEvent,
  NewHouseholdMember,
  NewSupportTicket,
  Profile,
  ProfileUpdate,
  Receipt,
  ReportPeriod,
  SubmitResult,
  SupportTicket,
  UserSettings,
} from './contract';
import {
  currentFarm,
  currentFarmData,
  currentSettings,
  EVENT_TABLES,
  eventToRow,
  findEntry,
  toEntry,
  toFarm,
  toMember,
  toProfile,
  toHorriotConnection,
  toMercuryConnection,
  toTicket,
  type EventType,
} from './entities';
import { isNetworkError, net, setOnline } from './net';
import { currentFarmRow, currentUserId } from './session';
import { getDoc, putLocal, rows, softDelete, type Row } from './store';
import { requestSync, syncNow } from './sync';

const farmIdOrThrow = (): string => {
  const farm = currentFarmRow();
  if (!farm) throw new Error('Хозяйство не найдено. Дождитесь загрузки данных');
  return String(farm.id);
};

// ─── Проверки событий ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateEvent(input: NewEvent, selfId?: string): void {
  if (!DATE_RE.test(input.occurred_on)) throw new Error('Укажите дату события');
  switch (input.type) {
    case 'livestock': {
      if (!Number.isInteger(input.heads) || input.heads <= 0) throw new Error('Количество голов должно быть больше нуля');
      const outgoing = ['sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out'].includes(input.kind);
      if (outgoing) {
        const data = currentFarmData();
        const movements = (data?.movements ?? []).filter((m) => m.id !== selfId);
        const have = balanceOn(movements, input.occurred_on)[input.animal_group] ?? 0;
        if (input.heads > have) throw new Error(`В группе на эту дату только ${have} голов`);
      }
      break;
    }
    case 'product_output':
      if (!(input.quantity >= 0)) throw new Error('Количество не может быть отрицательным');
      break;
    case 'product_sale':
      if (!(input.quantity > 0)) throw new Error('Количество должно быть больше нуля');
      break;
    case 'feed':
      if (!(input.quantity_t >= 0)) throw new Error('Количество не может быть отрицательным');
      break;
    case 'crop':
      if (!input.plot_name.trim() || !input.crop.trim()) throw new Error('Укажите участок и культуру');
      if (!(input.area_ha >= 0)) throw new Error('Площадь не может быть отрицательной');
      break;
  }
}

// ─── События ────────────────────────────────────────────────────────────────

export function createEvent(input: NewEvent): JournalEntry {
  validateEvent(input);
  const farm_id = farmIdOrThrow();
  const now = nowIso();
  const row: Row = { id: newId(), farm_id, ...eventToRow(input), created_at: now, updated_at: now, deleted_at: null };
  putLocal(EVENT_TABLES[input.type], 'id', row);
  requestSync();
  return toEntry(input.type, row);
}

export function updateEvent(id: string, input: NewEvent): JournalEntry {
  validateEvent(input, id);
  const existing = findEntry(id);
  if (!existing) throw new Error('Запись не найдена');
  if (existing.type !== input.type) {
    // Тип события изменился: старую запись удаляем, новую создаём (дата создания сохраняется).
    softDelete(EVENT_TABLES[existing.type], id, nowIso());
    const now = nowIso();
    const row: Row = { id: newId(), farm_id: existing.farm_id, ...eventToRow(input), created_at: existing.created_at, updated_at: now, deleted_at: null };
    putLocal(EVENT_TABLES[input.type], 'id', row);
    requestSync();
    return toEntry(input.type, row);
  }
  const table = EVENT_TABLES[input.type];
  const old = getDoc(table, id)!.data;
  const row: Row = { ...old, ...eventToRow(input), updated_at: nowIso() };
  putLocal(table, 'id', row);
  requestSync();
  return toEntry(input.type, row);
}

export function deleteEvent(id: string, type: EventType): void {
  softDelete(EVENT_TABLES[type], id, nowIso());
  requestSync();
}

// ─── Хозяйство и ЛПХ ────────────────────────────────────────────────────────

export function updateFarm(input: FarmUpdate): Farm {
  const row = currentFarmRow();
  if (!row) throw new Error('Хозяйство не найдено');
  if (input.name !== undefined && !input.name.trim()) throw new Error('Название хозяйства не может быть пустым');
  if (input.inn && !/^(\d{10}|\d{12})$/.test(input.inn)) throw new Error('ИНН — 10 или 12 цифр');
  const next: Row = { ...row, ...input, updated_at: nowIso() };
  putLocal('farms', 'id', next);
  // Контакты для восстановления доступа хранятся в профиле, а не в хозяйстве.
  requestSync();
  return toFarm(next);
}

export function addHouseholdMember(input: NewHouseholdMember): HouseholdMember {
  if (!input.full_name.trim()) throw new Error('Укажите фамилию, имя, отчество');
  if (!input.relation.trim()) throw new Error('Укажите отношение к главе ЛПХ');
  if (!input.consent) throw new Error('Нужно согласие на внесение сведений');
  const now = nowIso();
  const row: Row = {
    id: newId(),
    farm_id: farmIdOrThrow(),
    full_name: input.full_name.trim(),
    birth_date: input.birth_date ?? null,
    relation: input.relation.trim(),
    is_head: false,
    consent: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  putLocal('household_members', 'id', row);
  requestSync();
  return toMember(row);
}

/** Контакты для восстановления доступа (экран F2): email, телефон, имя. */
export function updateProfile(patch: ProfileUpdate): Profile {
  const id = currentUserId();
  if (!id) throw new Error('Нет активной сессии');
  const email = patch.email === undefined ? undefined : (patch.email ?? '').trim() || null;
  const phone = patch.phone === undefined ? undefined : (patch.phone ?? '').trim() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Проверьте email');
  if (phone && phone.replace(/\D/g, '').length < 10) throw new Error('Телефон — не меньше 10 цифр');
  const old = getDoc('profiles', id)?.data ?? { id };
  const next: Row = {
    ...old,
    ...(email !== undefined ? { email } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(patch.full_name !== undefined ? { full_name: patch.full_name } : {}),
    updated_at: nowIso(),
  };
  putLocal('profiles', 'id', next);
  requestSync();
  return toProfile(next);
}

// ─── Меркурий (демо) ────────────────────────────────────────────────────────

export function mercuryConnect(): MercuryConnection {
  const farm_id = farmIdOrThrow();
  const now = nowIso();
  const old = getDoc('mercury_connections', farm_id)?.data;
  const row: Row = { created_at: now, ...old, farm_id, status: 'connected_demo', synced_at: now, updated_at: now, deleted_at: null };
  putLocal('mercury_connections', 'farm_id', row);
  requestSync();
  return toMercuryConnection(row);
}

/** Создаёт учебные ВСД из продаж со статусом draft/pending (то же, что делает api/mercury/sync.ts). */
export function mercuryRefresh(): MercuryConnection {
  const farm_id = farmIdOrThrow();
  const conn = getDoc('mercury_connections', farm_id)?.data;
  if (conn?.status !== 'connected_demo') throw new Error('Меркурий не подключён. Сначала подключите демо-режим');
  const farm = currentFarm()!;
  const sources: MercurySource[] = [
    ...rows('product_sales').map(
      (r): MercurySource => ({
        kind: 'product_sale',
        id: String(r.id),
        occurred_on: String(r.occurred_on),
        product: r.product as MercurySource['product'],
        quantity: Number(r.quantity),
        counterparty: (r.buyer as string | null) ?? null,
        destination: (r.destination as string | null) ?? null,
        mercury_status: r.mercury_status as MercurySource['mercury_status'],
      }),
    ),
    ...rows('livestock_movements')
      .filter((r) => ['sale', 'sale_slaughter', 'transfer_out'].includes(String(r.kind)))
      .map(
        (r): MercurySource => ({
          kind: 'livestock',
          id: String(r.id),
          occurred_on: String(r.occurred_on),
          group: r.animal_group as MercurySource['group'],
          quantity: Number(r.heads),
          counterparty: (r.counterparty as string | null) ?? null,
          destination: (r.destination as string | null) ?? null,
          mercury_status: r.mercury_status as MercurySource['mercury_status'],
        }),
      ),
  ];
  const docs = rows('mercury_documents');
  const planned = planMercurySync(
    sources,
    docs.map((d) => String(d.number)),
    new Set(docs.map((d) => String(d.source_id ?? '')).filter(Boolean)),
    farm.name,
    todayIso(),
  );
  const now = nowIso();
  for (const d of planned) {
    putLocal('mercury_documents', 'id', { id: newId(), farm_id, ...d, created_at: now, updated_at: now, deleted_at: null });
    const table = d.source_kind === 'product_sale' ? 'product_sales' : 'livestock_movements';
    const src = getDoc(table, d.source_id)?.data;
    if (src) putLocal(table, 'id', { ...src, mercury_status: 'issued', mercury_vsd_id: d.number, updated_at: now });
  }
  const next: Row = { ...conn, farm_id, synced_at: now, updated_at: now };
  putLocal('mercury_connections', 'farm_id', next);
  requestSync();
  return toMercuryConnection(next);
}

// ─── Хорриот (демо) ─────────────────────────────────────────────────────────

export function horriotConnect(): HorriotConnection {
  const farm_id = farmIdOrThrow();
  const now = nowIso();
  const old = getDoc('horriot_connections', farm_id)?.data;
  const row: Row = { created_at: now, ...old, farm_id, status: 'connected_demo', synced_at: now, updated_at: now, deleted_at: null };
  putLocal('horriot_connections', 'farm_id', row);
  requestSync();
  return toHorriotConnection(row);
}

/** «Передать данные»: создаёт учебные записи УЧ-ХР-NNN из журнала поголовья (то же, что делает api/horriot/sync.ts). */
export function horriotRefresh(): HorriotConnection {
  const farm_id = farmIdOrThrow();
  const conn = getDoc('horriot_connections', farm_id)?.data;
  if (conn?.status !== 'connected_demo' || conn.deleted_at) throw new Error('Хорриот не подключён. Сначала подключите демо-режим');
  const sources: HorriotSource[] = rows('livestock_movements').map((r) => ({
    id: String(r.id),
    occurred_on: String(r.occurred_on),
    animal_group: r.animal_group as HorriotSource['animal_group'],
    kind: r.kind as HorriotSource['kind'],
    heads: Number(r.heads),
  }));
  const records = rows('horriot_records');
  const planned = planHorriotSync(
    sources,
    records.map((r) => String(r.number)),
    new Set(records.map((r) => String(r.source_movement_id ?? '')).filter(Boolean)),
  );
  const now = nowIso();
  for (const p of planned) {
    const { group_label: _label, ...fields } = p;
    void _label;
    putLocal('horriot_records', 'id', { id: newId(), farm_id, ...fields, created_at: now, updated_at: now, deleted_at: null });
  }
  const next: Row = { ...conn, farm_id, synced_at: now, updated_at: now };
  putLocal('horriot_connections', 'farm_id', next);
  requestSync();
  return toHorriotConnection(next);
}

// ─── Уведомления, настройки, поддержка ──────────────────────────────────────

export function markNotificationsRead(ids?: string[]): void {
  const now = nowIso();
  for (const n of rows('notifications')) {
    if (n.read) continue;
    if (ids && !ids.includes(String(n.id))) continue;
    putLocal('notifications', 'id', { ...n, read: true, updated_at: now });
  }
  requestSync();
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const user_id = currentUserId();
  if (!user_id) throw new Error('Нет активной сессии');
  const now = nowIso();
  const merged = { ...currentSettings(), ...patch };
  const old = getDoc('user_settings', user_id)?.data;
  putLocal('user_settings', 'user_id', { created_at: now, ...old, user_id, ...merged, updated_at: now, deleted_at: null });
  requestSync();
  return merged;
}

export function createSupportTicket(input: NewSupportTicket): SupportTicket {
  if (!input.topic.trim()) throw new Error('Выберите тему обращения');
  if (!input.message.trim()) throw new Error('Опишите вопрос');
  const farm = currentFarm();
  const base = Number(farm?.book_record_no) || 1;
  const count = rows('support_tickets').length;
  const now = nowIso();
  const row: Row = {
    id: newId(),
    farm_id: farmIdOrThrow(),
    number: `AGRO-${todayIso().slice(0, 4)}-${String(base + count).padStart(4, '0')}`,
    topic: input.topic.trim(),
    related_section: input.related_section ?? null,
    message: input.message.trim(),
    attachment_uri: input.attachment_uri ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  putLocal('support_tickets', 'id', row);
  requestSync();
  return toTicket(row);
}

// ─── Отчёты ─────────────────────────────────────────────────────────────────

export async function submitReport(form: FormCode, period: ReportPeriod): Promise<SubmitResult> {
  const data = currentFarmData();
  if (!data) return { ok: false, error: 'server', message: 'Хозяйство не найдено. Дождитесь загрузки данных' };
  if (!net.online) {
    return { ok: false, error: 'network', message: 'Нет подключения к сети. Данные сохранены локально, отправка станет доступна онлайн' };
  }
  if (!(form in DEADLINES)) return { ok: false, error: 'server', message: 'Неизвестная форма отчёта' };
  const token = await accessToken();
  if (!token) return { ok: false, error: 'server', message: 'Сессия истекла. Войдите заново' };

  // Сначала отправляем накопленные правки, чтобы сервер посчитал снимок по актуальным данным.
  await syncNow({ force: true });
  if (!net.online) {
    return { ok: false, error: 'network', message: 'Нет ответа от сервиса. Проверьте подключение к интернету и попробуйте ещё раз' };
  }
  try {
    const res = await fetch(apiUrl('/api/reports/submit'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ farm_id: data.farm.id, form, year: period.year, month: period.month ?? null }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; receipt?: Receipt };
    if (!res.ok || !body.ok || !body.receipt) {
      return { ok: false, error: 'server', message: body.error ?? 'Сервер отклонил отправку. Попробуйте позже' };
    }
    setOnline(true);
    void syncNow({ force: true });
    return { ok: true, receipt: body.receipt };
  } catch (e) {
    if (isNetworkError(e)) setOnline(false);
    return { ok: false, error: 'network', message: 'Нет ответа от сервиса. Проверьте подключение к интернету и попробуйте ещё раз' };
  }
}

export async function reportDownloadUrl(form: FormCode, period: ReportPeriod): Promise<string | null> {
  const data = currentFarmData();
  if (!data) return null;
  const today = todayIso();
  const obligation = buildObligation({ data, today }, form, period);
  if (!obligation.has_official_blank) return null;
  const token = await accessToken();
  if (!token) return null;
  const monthly = isMonthly(form, data.farm.legal_status);
  return apiUrl(`/api/reports/${form}`, {
    farm_id: data.farm.id,
    year: period.year,
    month: monthly || form === '3-fermer-month' ? period.month : undefined,
    access_token: token,
  });
}

export async function receiptUrl(receiptNo: string): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error('Сессия истекла. Войдите заново');
  return apiUrl(`/api/receipts/${encodeURIComponent(receiptNo)}`, { access_token: token });
}

export async function householdExtract(): Promise<HouseholdExtract> {
  const farm_id = farmIdOrThrow();
  const token = await accessToken();
  if (!token) throw new Error('Сессия истекла. Войдите заново');
  return { url: apiUrl('/api/household/extract', { farm_id, access_token: token }), generated_on: todayIso() };
}

