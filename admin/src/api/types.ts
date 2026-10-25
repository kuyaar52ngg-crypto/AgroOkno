// Типы ответов RPC и серверных маршрутов — строго по docs/TZ-admin.md §2–§3 (snake_case, как в jsonb).

export type LegalStatus = 'kfh' | 'ip' | 'lph';
export type UserRole = 'farm_head' | 'lph_owner' | 'council_specialist';
export type TicketStatus = 'new' | 'in_progress' | 'answered' | 'closed';
/** Роль в хозяйстве: farm_members.role. */
export type MemberRole = 'owner' | 'member';
/** Статус подключения «Меркурия»/«Хорриота» (mercury_connections/horriot_connections). */
export type ConnectionStatus = 'not_connected' | 'connected_demo';
export type BroadcastTarget = 'all' | 'status' | 'farms';

export interface Paged<T> {
  total: number;
  items: T[];
}

export interface PageParams {
  limit: number;
  offset: number;
}

// ─── admin_stats ────────────────────────────────────────────────────────────

export interface AdminStats {
  users_total: number;
  users_new: number;
  farms_total: number;
  farms_by_status: { kfh: number; ip: number; lph: number };
  events_count: number;
  reports_by_form: { form_code: string; count: number }[];
  mercury_connected: number;
  horriot_connected: number;
  assistant_messages: number;
  open_tickets: number;
  daily: { date: string; events: number; new_users: number }[];
}

// ─── Пользователи ───────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  full_name: string | null;
  /** profiles.email — технический email auth.users не отдаётся. */
  email: string | null;
  phone: string | null;
  role: UserRole | null;
  settlement: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  farms_count: number;
}

export interface AdminUserFarm {
  id: string;
  name: string;
  inn: string | null;
  legal_status: LegalStatus;
  member_role: MemberRole;
}

export interface AdminUserTicket {
  id: string;
  number: string;
  topic: string;
  status: TicketStatus;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  farms: AdminUserFarm[];
  tickets: AdminUserTicket[];
  events_30d: number;
}

export interface ListUsersParams extends PageParams {
  search: string;
}

// ─── Хозяйства ──────────────────────────────────────────────────────────────

export interface AdminFarm {
  id: string;
  name: string;
  inn: string | null;
  legal_status: LegalStatus;
  region: string | null;
  settlement: string | null;
  owner: { id: string; full_name: string | null; email: string | null } | null;
  members_count: number;
  created_at: string;
  last_activity_at: string | null;
  mercury_status: ConnectionStatus | string | null;
  horriot_status: ConnectionStatus | string | null;
  reports_submitted: number;
}

export interface AdminFarmMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: MemberRole;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AdminFarmJoinRequest {
  id: string;
  user_id: string;
  full_name: string | null;
  status: JoinRequestStatus | string;
  created_at: string;
}

export interface AdminFarmSubmission {
  id: string;
  form_code: string;
  period_year: number;
  period_month: number | null;
  receipt_no: string | null;
  submitted_at: string | null;
}

export interface AdminFarmDetail extends AdminFarm {
  address: string | null;
  ogrn: string | null;
  oktmo: string | null;
  book_record_no: string | null;
  invite_code: string | null;
  members: AdminFarmMember[];
  join_requests: AdminFarmJoinRequest[];
  submissions: AdminFarmSubmission[];
}

export interface ListFarmsParams extends PageParams {
  search: string;
  status: LegalStatus | null;
}

// ─── Отчёты ─────────────────────────────────────────────────────────────────

export interface AdminSubmission {
  id: string;
  farm_id: string;
  farm_name: string;
  inn: string | null;
  form_code: string;
  period_year: number;
  period_month: number | null;
  status: 'draft' | 'submitted' | 'failed' | string;
  recipient: string | null;
  receipt_no: string | null;
  submitted_at: string | null;
}

export interface ListSubmissionsParams extends PageParams {
  form: string | null;
  year: number | null;
  search: string;
}

// ─── Сроки (таблица report_deadlines) ───────────────────────────────────────

export interface ReportDeadline {
  form_code: string;
  title: string;
  description: string;
  authority: 'rosstat' | 'minselhoz' | 'sakhastat' | string;
  recipient: string;
  scope: 'federal' | 'regional' | string;
  receipt_code: string;
  period_kind: 'year' | 'month' | 'any' | string;
  period_shift_months: number;
  due_month_offset: number;
  due_year_offset: number;
  due_month: number | null;
  due_day: number;
  has_official_blank: boolean;
  comment: string | null;
}

/** Разрешённые ключи admin_update_deadline.p_patch. */
export type DeadlinePatch = Partial<
  Pick<ReportDeadline, 'title' | 'description' | 'comment' | 'due_month' | 'due_day' | 'due_month_offset' | 'due_year_offset'>
>;

// ─── Поддержка ──────────────────────────────────────────────────────────────

export interface AdminTicket {
  id: string;
  number: string;
  topic: string;
  related_section: string | null;
  message: string;
  status: TicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  farm_id: string;
  farm_name: string | null;
  /** Владелец хозяйства. */
  user_full_name: string | null;
  user_email: string | null;
  replied_by?: string | null;
}

export interface ListTicketsParams extends PageParams {
  status: TicketStatus | null;
  search: string;
}

// ─── Рассылки ───────────────────────────────────────────────────────────────

export interface BroadcastInput {
  title: string;
  body: string;
  target: BroadcastTarget;
  status: LegalStatus | null;
  farm_ids: string[] | null;
}

/** Ответ POST /v1/admin/broadcasts. */
export interface BroadcastResult {
  broadcast_id: string;
  farms_count: number;
  push_sent: number;
}

/** Элемент admin_list_broadcasts: поля таблицы admin_broadcasts (+ email автора, если RPC его отдаёт). */
export interface AdminBroadcast {
  id: string;
  title: string;
  body: string;
  target: unknown;
  farms_count: number;
  push_sent: number;
  created_by?: string | null;
  created_by_email?: string | null;
  created_at: string;
}

/** Ответ POST /v1/admin/users/:id/block|unblock. */
export interface BlockResult {
  user_id: string;
  blocked: boolean;
  banned_until: string | null;
}

// ─── Журнал действий ────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: string;
  admin_id?: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: unknown;
  created_at: string;
}

export interface ListAuditParams extends PageParams {
  action: string | null;
}

// ─── Модель помощника (сервер /v1/admin/*) ──────────────────────────────────

export interface AssistantModelOption {
  id: string;
  name: string;
  free: boolean;
  context_length: number | null;
}

export interface AssistantModelSettings {
  model: string;
  fallback_models: string[];
  updated_at: string | null;
  updated_by: string | null;
}

// ─── Авторизация ────────────────────────────────────────────────────────────

export interface SessionInfo {
  userId: string;
  /** Email учётной записи Supabase (может быть техническим — в интерфейсе не показывать как есть). */
  email: string | null;
}

export interface AdminProfile {
  full_name: string | null;
  email: string | null;
}

export type SignInResult = { ok: true } | { ok: false; message: string };

// ─── Интерфейс слоя API (реальный и заглушки реализуют один и тот же) ─────────

export interface AdminApi {
  readonly mock: boolean;
  auth: {
    getSession(): Promise<SessionInfo | null>;
    onChange(cb: (session: SessionInfo | null) => void): () => void;
    signIn(identifier: string, password: string): Promise<SignInResult>;
    signOut(): Promise<void>;
    isAdmin(): Promise<boolean>;
    profile(userId: string): Promise<AdminProfile | null>;
  };
  stats(from: string, to: string): Promise<AdminStats>;
  listUsers(p: ListUsersParams): Promise<Paged<AdminUser>>;
  getUser(id: string): Promise<AdminUserDetail>;
  setAdmin(id: string, grant: boolean): Promise<AdminUser>;
  blockUser(id: string, reason?: string): Promise<BlockResult>;
  unblockUser(id: string): Promise<BlockResult>;
  listFarms(p: ListFarmsParams): Promise<Paged<AdminFarm>>;
  getFarm(id: string): Promise<AdminFarmDetail>;
  listSubmissions(p: ListSubmissionsParams): Promise<Paged<AdminSubmission>>;
  listDeadlines(): Promise<ReportDeadline[]>;
  updateDeadline(formCode: string, patch: DeadlinePatch): Promise<ReportDeadline>;
  listTickets(p: ListTicketsParams): Promise<Paged<AdminTicket>>;
  /** reply = null оставляет прежний ответ (без нового уведомления); status = null при новом ответе ставит «Отвечено». */
  replyTicket(id: string, reply: string | null, status: TicketStatus | null): Promise<AdminTicket>;
  broadcast(input: BroadcastInput): Promise<BroadcastResult>;
  listBroadcasts(p: PageParams): Promise<Paged<AdminBroadcast>>;
  listAudit(p: ListAuditParams): Promise<Paged<AdminAuditEntry>>;
  assistantSettings(): Promise<AssistantModelSettings>;
  assistantModels(): Promise<AssistantModelOption[]>;
  saveAssistantSettings(s: Pick<AssistantModelSettings, 'model' | 'fallback_models'>): Promise<AssistantModelSettings>;
}
