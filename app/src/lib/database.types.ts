// Типы схемы Supabase (проект agrookno), сгенерированы generate_typescript_types и сокращены:
// оставлены перечисления, строки таблиц (Row) и сигнатуры функций. Обновлять после новых миграций.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CropOperation = 'sowing' | 'harvest';
export type FarmKind = 'kfh' | 'ip' | 'lph';
export type FeedKind = 'hay' | 'haylage' | 'silage' | 'grain' | 'other';
export type FeedOperation = 'harvest' | 'purchase' | 'use';
export type LivestockGroupDb =
  | 'cattle_cows' | 'cattle_other' | 'pigs_sows' | 'pigs_other' | 'sheep' | 'goats' | 'horses_mares'
  | 'horses_other' | 'deer' | 'poultry' | 'rabbits' | 'cattle_calves' | 'horses_young' | 'horses_stallions';
export type MercuryStatusDb = 'not_required' | 'draft' | 'pending' | 'issued' | 'error';
export type MovementKindDb =
  | 'opening_balance' | 'birth' | 'purchase' | 'transfer_in' | 'sale' | 'sale_slaughter' | 'slaughter' | 'death' | 'transfer_out';
export type ProductKindDb = 'milk' | 'eggs' | 'wool' | 'honey';
export type UserRoleDb = 'farm_head' | 'lph_owner' | 'council_specialist';

interface SyncCols {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Tables {
  profiles: { id: string; full_name: string | null; phone: string | null; email: string | null; role: UserRoleDb | null; settlement: string | null; created_at: string; updated_at: string };
  farms: SyncCols & {
    id: string; owner_id: string; invite_code: string | null; legal_status: FarmKind; name: string; inn: string | null; ogrn: string | null; okpo: string | null;
    oktmo: string | null; address: string | null; head_name: string | null; region: string | null; settlement: string | null;
    book_record_no: string | null; cadastral_no: string | null; plot_area_m2: number | null;
  };
  household_members: SyncCols & { id: string; farm_id: string; full_name: string; birth_date: string | null; relation: string; is_head: boolean; consent: boolean };
  livestock_movements: SyncCols & {
    id: string; farm_id: string; occurred_on: string; animal_group: LivestockGroupDb; kind: MovementKindDb; heads: number;
    live_weight_kg: number | null; amount_rub: number | null; counterparty: string | null; counterparty_inn: string | null;
    destination: string | null; vehicle_number: string | null; mercury_status: MercuryStatusDb; mercury_vsd_id: string | null; note: string | null;
  };
  product_outputs: SyncCols & { id: string; farm_id: string; occurred_on: string; product: ProductKindDb; quantity: number; source_group: LivestockGroupDb | null; note: string | null };
  product_sales: SyncCols & {
    id: string; farm_id: string; occurred_on: string; product: ProductKindDb; quantity: number; amount_rub: number | null; buyer: string | null;
    buyer_inn: string | null; destination: string | null; vehicle_number: string | null; mercury_status: MercuryStatusDb; mercury_vsd_id: string | null; note: string | null;
  };
  feed_events: SyncCols & { id: string; farm_id: string; occurred_on: string; feed: FeedKind; operation: FeedOperation; quantity_t: number; storage_place: string | null; note: string | null };
  crop_events: SyncCols & { id: string; farm_id: string; occurred_on: string; plot_name: string; crop: string; operation: CropOperation; area_ha: number; yield_t: number | null; note: string | null };
  report_deadlines: {
    form_code: string; title: string; description: string; authority: 'rosstat' | 'minselhoz' | 'sakhastat'; recipient: string; scope: 'federal' | 'regional';
    receipt_code: string; period_kind: 'year' | 'month' | 'any'; period_shift_months: number; due_month_offset: number; due_year_offset: number;
    due_month: number | null; due_day: number; has_official_blank: boolean; comment: string | null;
  };
  report_submissions: SyncCols & {
    id: string; farm_id: string; form_code: string; period_year: number; period_month: number | null; status: 'draft' | 'submitted' | 'failed';
    recipient: string | null; receipt_no: string | null; submitted_at: string | null; snapshot: Json | null;
  };
  receipt_counters: { farm_id: string; year: number; last_no: number };
  mercury_connections: SyncCols & { farm_id: string; status: 'not_connected' | 'connected_demo'; synced_at: string | null };
  mercury_documents: SyncCols & {
    id: string; farm_id: string; number: string; product: string; quantity: number; unit: string; status: 'issued' | 'redeemed'; issued_on: string;
    produced_on: string | null; sender: string; recipient: string; source_kind: 'product_sale' | 'livestock' | null; source_id: string | null;
  };
  notifications: SyncCols & { id: string; farm_id: string; kind: 'overdue' | 'deadline' | 'sync' | 'submitted'; title: string; body: string; form_code: string | null; read: boolean };
  user_settings: SyncCols & {
    user_id: string; push_enabled: boolean; deadline_reminders: boolean; sound: boolean; text_size: 'standard' | 'large';
    reminders_in_chat: boolean; remind_7_days: boolean; remind_1_day: boolean;
  };
  support_tickets: SyncCols & { id: string; farm_id: string; number: string; topic: string; related_section: string | null; message: string; attachment_uri: string | null };
  farm_members: { farm_id: string; user_id: string; role: 'owner' | 'member'; created_at: string };
  farm_join_requests: {
    id: string; farm_id: string; user_id: string; farm_name: string; farm_settlement: string | null; contact: string | null;
    status: 'pending' | 'approved' | 'rejected'; created_at: string; updated_at: string; decided_at: string | null; decided_by: string | null;
  };
  push_tokens: { user_id: string; token: string; platform: 'ios' | 'android' | 'web'; updated_at: string };
  reminder_log: { farm_id: string; form_code: string; period: string; kind: '7d' | '1d' | 'overdue'; sent_at: string };
  chat_messages: SyncCols & {
    id: string; farm_id: string; user_id: string; role: 'user' | 'assistant'; text: string; cards: Json | null; from_voice: boolean;
  };
  recovery_codes: { user_id: string; code_hash: string; expires_at: string; attempts: number };
}

export interface Functions {
  submit_report: {
    Args: { p_farm_id: string; p_form_code: string; p_year: number; p_month: number | null; p_snapshot: Json };
    Returns: { out_receipt_no: string; out_submitted_at: string; out_recipient: string }[];
  };
  livestock_balance: { Args: { p_farm_id: string; p_on: string }; Returns: { animal_group: LivestockGroupDb; heads: number }[] };
  owns_farm: { Args: { target_farm_id: string }; Returns: boolean };
  is_council_for: { Args: { target_farm_id: string }; Returns: boolean };
  is_farm_owner: { Args: { target_farm_id: string }; Returns: boolean };
  my_farm_id: { Args: Record<string, never>; Returns: string | null };
  create_farm: { Args: { p_name: string; p_legal_status: string; p_region: string; p_settlement: string; p_inn?: string | null }; Returns: Tables['farms'] };
  find_farm: { Args: { p_query: string }; Returns: { farm_id: string; name: string; region: string | null; settlement: string | null }[] };
  request_farm_access: { Args: { p_farm_id: string }; Returns: Tables['farm_join_requests'] };
  resolve_join_request: { Args: { p_id: string; p_approve: boolean }; Returns: Tables['farm_join_requests'] };
  resolve_login_email: { Args: { p_identifier: string }; Returns: string };
  register_push_token: { Args: { p_token: string; p_platform: string }; Returns: void };
}
