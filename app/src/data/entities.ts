// Преобразование строк локальной БД (колонки Supabase) в типы контракта и обратно,
// сборка FarmData для мапперов отчётов.
import type {
  AppNotification,
  CropEvent,
  Farm,
  FeedEvent,
  HouseholdMember,
  IsoDate,
  JournalEntry,
  LivestockEvent,
  MercuryConnection,
  MercuryDocument,
  NewEvent,
  Profile,
  ProductOutputEvent,
  ProductSaleEvent,
  SupportTicket,
  UserSettings,
} from './contract';
import { rows, getDoc, type Row } from './store';
import { currentFarmRow, currentUserId } from './session';
import type { FarmData } from '../reports/types';

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const EVENT_TABLES = {
  livestock: 'livestock_movements',
  product_output: 'product_outputs',
  product_sale: 'product_sales',
  feed: 'feed_events',
  crop: 'crop_events',
} as const;

export type EventType = keyof typeof EVENT_TABLES;

export const isPendingRow = (tbl: string, id: string) => getDoc(tbl, id)?.pending ?? false;

// ─── Профиль и хозяйство ────────────────────────────────────────────────────

export function toProfile(r: Row): Profile {
  return {
    id: String(r.id),
    full_name: str(r.full_name),
    email: str(r.email),
    phone: str(r.phone),
    role: (str(r.role) as Profile['role']) ?? null,
  };
}

export function currentProfile(): Profile | null {
  const id = currentUserId();
  const doc = id ? getDoc('profiles', id) : undefined;
  return doc ? toProfile(doc.data) : null;
}

export function toFarm(r: Row): Farm {
  return {
    id: String(r.id),
    owner_id: String(r.owner_id),
    legal_status: r.legal_status as Farm['legal_status'],
    name: String(r.name),
    inn: str(r.inn),
    ogrn: str(r.ogrn),
    okpo: str(r.okpo),
    oktmo: str(r.oktmo),
    region: str(r.region),
    settlement: str(r.settlement),
    address: str(r.address),
    head_name: str(r.head_name),
    book_record_no: str(r.book_record_no),
    cadastral_no: str(r.cadastral_no),
    plot_area_m2: numOrNull(r.plot_area_m2),
  };
}

export function currentFarm(): Farm | null {
  const row = currentFarmRow();
  return row ? toFarm(row) : null;
}

// ─── События ────────────────────────────────────────────────────────────────

function base(r: Row, tbl: string) {
  return {
    id: String(r.id),
    farm_id: String(r.farm_id),
    occurred_on: String(r.occurred_on) as IsoDate,
    note: str(r.note),
    created_at: String(r.created_at),
    pending_sync: isPendingRow(tbl, String(r.id)),
  };
}

export function toEntry(type: EventType, r: Row): JournalEntry {
  const tbl = EVENT_TABLES[type];
  switch (type) {
    case 'livestock':
      return {
        ...base(r, tbl),
        type: 'livestock',
        animal_group: r.animal_group as LivestockEvent['animal_group'],
        kind: r.kind as LivestockEvent['kind'],
        heads: num(r.heads),
        live_weight_kg: numOrNull(r.live_weight_kg),
        amount_rub: numOrNull(r.amount_rub),
        counterparty: str(r.counterparty),
        counterparty_inn: str(r.counterparty_inn),
        destination: str(r.destination),
        vehicle_number: str(r.vehicle_number),
        mercury_status: (r.mercury_status as LivestockEvent['mercury_status']) ?? 'not_required',
      };
    case 'product_output':
      return {
        ...base(r, tbl),
        type: 'product_output',
        product: r.product as ProductOutputEvent['product'],
        quantity: num(r.quantity),
        source_group: (str(r.source_group) as ProductOutputEvent['source_group']) ?? null,
      };
    case 'product_sale':
      return {
        ...base(r, tbl),
        type: 'product_sale',
        product: r.product as ProductSaleEvent['product'],
        quantity: num(r.quantity),
        amount_rub: numOrNull(r.amount_rub),
        buyer: str(r.buyer),
        buyer_inn: str(r.buyer_inn),
        destination: str(r.destination),
        vehicle_number: str(r.vehicle_number),
        mercury_status: (r.mercury_status as ProductSaleEvent['mercury_status']) ?? 'not_required',
      };
    case 'feed':
      return {
        ...base(r, tbl),
        type: 'feed',
        feed: r.feed as FeedEvent['feed'],
        operation: r.operation as FeedEvent['operation'],
        quantity_t: num(r.quantity_t),
        storage_place: str(r.storage_place),
      };
    case 'crop':
      return {
        ...base(r, tbl),
        type: 'crop',
        plot_name: String(r.plot_name),
        crop: String(r.crop),
        operation: r.operation as CropEvent['operation'],
        area_ha: num(r.area_ha),
        yield_t: numOrNull(r.yield_t),
      };
  }
}

export function allEntries(): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const type of Object.keys(EVENT_TABLES) as EventType[]) {
    for (const r of rows(EVENT_TABLES[type])) out.push(toEntry(type, r));
  }
  return out;
}

export function findEntry(id: string): JournalEntry | null {
  for (const type of Object.keys(EVENT_TABLES) as EventType[]) {
    const doc = getDoc(EVENT_TABLES[type], id);
    if (doc && !doc.data.deleted_at) return toEntry(type, doc.data);
  }
  return null;
}

/** Строка БД из NewEvent (без служебных полей — их выставляет вызывающий). */
export function eventToRow(input: NewEvent): Row {
  const common = { occurred_on: input.occurred_on, note: input.note ?? null };
  switch (input.type) {
    case 'livestock':
      return {
        ...common,
        animal_group: input.animal_group,
        kind: input.kind,
        heads: input.heads,
        live_weight_kg: input.live_weight_kg ?? null,
        amount_rub: input.amount_rub ?? null,
        counterparty: input.counterparty ?? null,
        counterparty_inn: input.counterparty_inn ?? null,
        destination: input.destination ?? null,
        vehicle_number: input.vehicle_number ?? null,
        mercury_status: input.mercury_status ?? 'not_required',
      };
    case 'product_output':
      return { ...common, product: input.product, quantity: input.quantity, source_group: input.source_group ?? null };
    case 'product_sale':
      return {
        ...common,
        product: input.product,
        quantity: input.quantity,
        amount_rub: input.amount_rub ?? null,
        buyer: input.buyer ?? null,
        buyer_inn: input.buyer_inn ?? null,
        destination: input.destination ?? null,
        vehicle_number: input.vehicle_number ?? null,
        mercury_status: input.mercury_status ?? 'not_required',
      };
    case 'feed':
      return { ...common, feed: input.feed, operation: input.operation, quantity_t: input.quantity_t, storage_place: input.storage_place ?? null };
    case 'crop':
      return {
        ...common,
        plot_name: input.plot_name,
        crop: input.crop,
        operation: input.operation,
        area_ha: input.area_ha,
        yield_t: input.yield_t ?? null,
      };
  }
}

// ─── Прочие сущности ────────────────────────────────────────────────────────

export function memberNote(relation: string, isHead: boolean): string {
  if (isHead) return 'Владелец рабочего пространства';
  if (/супруг/i.test(relation)) return 'Участие в ведении хозяйства';
  return 'Член семьи главы хозяйства';
}

export function toMember(r: Row): HouseholdMember {
  const relation = String(r.relation);
  const is_head = Boolean(r.is_head);
  return {
    id: String(r.id),
    full_name: String(r.full_name),
    birth_date: str(r.birth_date),
    relation,
    is_head,
    consent: Boolean(r.consent),
    note: memberNote(relation, is_head),
  };
}

export function toMercuryConnection(r: Row | undefined): MercuryConnection {
  return r
    ? { status: r.status as MercuryConnection['status'], synced_at: str(r.synced_at) }
    : { status: 'not_connected', synced_at: null };
}

export function toMercuryDocument(r: Row): MercuryDocument {
  return {
    id: String(r.id),
    number: String(r.number),
    product: String(r.product),
    quantity: num(r.quantity),
    unit: String(r.unit),
    status: r.status as MercuryDocument['status'],
    issued_on: String(r.issued_on),
    produced_on: str(r.produced_on),
    sender: String(r.sender),
    recipient: String(r.recipient),
  };
}

export function toNotification(r: Row): AppNotification {
  return {
    id: String(r.id),
    kind: r.kind as AppNotification['kind'],
    title: String(r.title),
    body: String(r.body),
    created_at: String(r.created_at),
    read: Boolean(r.read),
    ...(r.form_code ? { form_code: r.form_code as AppNotification['form_code'] } : {}),
  };
}

export const DEFAULT_SETTINGS: UserSettings = { push_enabled: true, deadline_reminders: true, sound: false, text_size: 'standard' };

export function currentSettings(): UserSettings {
  const id = currentUserId();
  const r = id ? getDoc('user_settings', id) : undefined;
  if (!r || r.data.deleted_at) return DEFAULT_SETTINGS;
  return {
    push_enabled: Boolean(r.data.push_enabled),
    deadline_reminders: Boolean(r.data.deadline_reminders),
    sound: Boolean(r.data.sound),
    text_size: (r.data.text_size as UserSettings['text_size']) ?? 'standard',
  };
}

export function toTicket(r: Row): SupportTicket {
  return {
    id: String(r.id),
    number: String(r.number),
    created_at: String(r.created_at),
    topic: String(r.topic),
    related_section: str(r.related_section),
    message: String(r.message),
    attachment_uri: str(r.attachment_uri),
  };
}

// ─── Данные для мапперов отчётов ────────────────────────────────────────────

export function currentFarmData(): FarmData | null {
  const farm = currentFarm();
  if (!farm) return null;
  return {
    farm,
    movements: rows('livestock_movements').map((r) => ({
      id: String(r.id),
      occurred_on: String(r.occurred_on),
      animal_group: r.animal_group as FarmData['movements'][number]['animal_group'],
      kind: r.kind as FarmData['movements'][number]['kind'],
      heads: num(r.heads),
      live_weight_kg: numOrNull(r.live_weight_kg),
      amount_rub: numOrNull(r.amount_rub),
    })),
    outputs: rows('product_outputs').map((r) => ({
      occurred_on: String(r.occurred_on),
      product: r.product as FarmData['outputs'][number]['product'],
      quantity: num(r.quantity),
      source_group: (str(r.source_group) as FarmData['outputs'][number]['source_group']) ?? null,
    })),
    sales: rows('product_sales').map((r) => ({
      occurred_on: String(r.occurred_on),
      product: r.product as FarmData['sales'][number]['product'],
      quantity: num(r.quantity),
      amount_rub: numOrNull(r.amount_rub),
    })),
    feed: rows('feed_events').map((r) => ({
      occurred_on: String(r.occurred_on),
      feed: r.feed as FarmData['feed'][number]['feed'],
      operation: r.operation as FarmData['feed'][number]['operation'],
      quantity_t: num(r.quantity_t),
    })),
    crops: rows('crop_events').map((r) => ({
      occurred_on: String(r.occurred_on),
      plot_name: String(r.plot_name),
      crop: String(r.crop),
      operation: r.operation as FarmData['crops'][number]['operation'],
      area_ha: num(r.area_ha),
      yield_t: numOrNull(r.yield_t),
    })),
    members: rows('household_members').map((r) => ({ full_name: String(r.full_name), is_head: Boolean(r.is_head) })),
    submissions: rows('report_submissions').map((r) => ({
      form_code: String(r.form_code),
      period_year: num(r.period_year),
      period_month: numOrNull(r.period_month),
      status: r.status as FarmData['submissions'][number]['status'],
      recipient: str(r.recipient),
      receipt_no: str(r.receipt_no),
      submitted_at: str(r.submitted_at),
      snapshot: r.snapshot ?? null,
    })),
  };
}
