// Общий контракт между слоем данных (агент A) и UI (агент B).
// UI импортирует хуки только из '@/data' (src/data/index.ts), типы — из '@/data/contract'.
// Изменения — только аддитивные (новые поля/хуки), каждое записывается в docs/CONTRACT-CHANGES.md.
import type { ComponentType, ReactNode } from 'react';

// ─── Базовые типы ───────────────────────────────────────────────────────────

export type Uuid = string;
/** YYYY-MM-DD */
export type IsoDate = string;
/** ISO 8601 с часовым поясом */
export type IsoDateTime = string;

export interface Query<T> {
  data: T | undefined;
  /** true только при первой загрузке без кеша (экран G1). */
  loading: boolean;
  /** Данные отданы из локального кеша без связи с сервером (экран G2). */
  fromCache: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface Mutation<Input, Output> {
  run: (input: Input) => Promise<Output>;
  pending: boolean;
  error: string | null;
}

// ─── Пользователь и хозяйство ───────────────────────────────────────────────

export type UserRole = 'farm_head' | 'lph_owner' | 'council_specialist';
export type LegalStatus = 'kfh' | 'ip' | 'lph';

export interface Profile {
  id: Uuid;
  full_name: string | null;
  /** Реальный контакт для восстановления доступа (не технический email входа). */
  email: string | null;
  phone: string | null;
  role: UserRole | null;
}

export interface Farm {
  id: Uuid;
  owner_id: Uuid;
  legal_status: LegalStatus;
  name: string;
  inn: string | null;
  ogrn: string | null;
  okpo: string | null;
  oktmo: string | null;
  region: string | null;
  settlement: string | null;
  address: string | null;
  head_name: string | null;
  /** Номер записи похозяйственной книги (только для ЛПХ, только чтение). */
  book_record_no: string | null;
  cadastral_no: string | null;
  plot_area_m2: number | null;
}

export type FarmUpdate = Partial<Omit<Farm, 'id' | 'owner_id' | 'book_record_no'>>;

/** Редактируемые поля профиля (экран F2: учебный email и телефон для восстановления доступа). */
export type ProfileUpdate = Partial<Pick<Profile, 'full_name' | 'email' | 'phone'>>;

// ─── Авторизация ────────────────────────────────────────────────────────────

export type AuthError =
  | 'invalid_inn' // ИНН не 10/12 цифр (контрольную сумму не проверяем — учебные ИНН)
  | 'invalid_credentials'
  | 'contact_not_found'
  | 'invalid_code'
  | 'weak_password'
  | 'network'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; error: AuthError; message: string };

export interface AuthApi {
  status: 'loading' | 'signed_out' | 'signed_in';
  profile: Profile | null;
  farm: Farm | null;
  /** Вход по ИНН хозяйства: под капотом email `<ИНН>@agrookno.app` + пароль. */
  signInWithInn: (inn: string, password: string) => Promise<AuthResult>;
  /** Шаг A4: отправить 6-значный код на телефон/email из профиля. */
  /** demoCode — учебный код, который UI подставляет в ячейки (только в демо-режиме, на проде отсутствует). */
  requestRecovery: (contact: string) => Promise<AuthResult & { maskedContact?: string; demoCode?: string }>;
  /** Шаг A5. */
  verifyRecoveryCode: (contact: string, code: string) => Promise<AuthResult>;
  /** Шаг A6 (после verifyRecoveryCode пользователь уже в сессии). */
  setNewPassword: (password: string) => Promise<AuthResult>;
  /** Шаг A7. */
  setRole: (role: UserRole) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

// ─── События хозяйства ──────────────────────────────────────────────────────

export type LivestockGroup =
  | 'cattle_cows' // КРС: коровы
  | 'cattle_calves' // КРС: телята, молодняк
  | 'cattle_other' // КРС: прочие (быки, нетели)
  | 'pigs_sows'
  | 'pigs_other'
  | 'sheep'
  | 'goats'
  | 'horses_mares' // кобылы
  | 'horses_young' // молодняк лошадей до 3 лет
  | 'horses_stallions' // взрослые жеребцы
  | 'horses_other'
  | 'deer'
  | 'poultry'
  | 'rabbits';

export type MovementKind =
  | 'opening_balance'
  | 'birth'
  | 'purchase'
  | 'transfer_in'
  | 'sale'
  | 'sale_slaughter'
  | 'slaughter'
  | 'death'
  | 'transfer_out';

/** milk, wool, honey — кг (молоко в UI вводится в литрах, 1 л = 1,03 кг — пересчёт в слое данных); eggs — шт. */
export type ProductKind = 'milk' | 'eggs' | 'wool' | 'honey';

export type FeedKind = 'hay' | 'haylage' | 'silage' | 'grain' | 'other';
export type FeedOperation = 'harvest' | 'purchase' | 'use';
export type CropOperation = 'sowing' | 'harvest';

export type MercuryStatus = 'not_required' | 'draft' | 'pending' | 'issued' | 'error';

interface EventBase {
  id: Uuid;
  farm_id: Uuid;
  occurred_on: IsoDate;
  note: string | null;
  created_at: IsoDateTime;
  /** Запись ещё не доехала до сервера. */
  pending_sync: boolean;
}

export interface LivestockEvent extends EventBase {
  type: 'livestock';
  animal_group: LivestockGroup;
  kind: MovementKind;
  heads: number;
  live_weight_kg: number | null;
  amount_rub: number | null;
  counterparty: string | null;
  counterparty_inn: string | null;
  destination: string | null;
  vehicle_number: string | null;
  mercury_status: MercuryStatus;
}

export interface ProductOutputEvent extends EventBase {
  type: 'product_output';
  product: ProductKind;
  /** В единицах ProductKind (кг / шт). */
  quantity: number;
  source_group: LivestockGroup | null;
}

export interface ProductSaleEvent extends EventBase {
  type: 'product_sale';
  product: ProductKind;
  quantity: number;
  amount_rub: number | null;
  buyer: string | null;
  buyer_inn: string | null;
  destination: string | null;
  vehicle_number: string | null;
  mercury_status: MercuryStatus;
}

export interface FeedEvent extends EventBase {
  type: 'feed';
  feed: FeedKind;
  operation: FeedOperation;
  quantity_t: number;
  storage_place: string | null;
}

export interface CropEvent extends EventBase {
  type: 'crop';
  plot_name: string;
  crop: string; // «Картофель», «Овощи открытого грунта», …
  operation: CropOperation;
  area_ha: number;
  /** Для сбора урожая. */
  yield_t: number | null;
}

export type JournalEntry = LivestockEvent | ProductOutputEvent | ProductSaleEvent | FeedEvent | CropEvent;
export type EventType = JournalEntry['type'];

type NewOf<T> = Omit<T, 'id' | 'farm_id' | 'created_at' | 'pending_sync'>;
export type NewEvent =
  | NewOf<LivestockEvent>
  | NewOf<ProductOutputEvent>
  | NewOf<ProductSaleEvent>
  | NewOf<FeedEvent>
  | NewOf<CropEvent>;

export interface JournalFilter {
  year: number;
  /** 1–12 */
  month: number;
  type?: EventType;
}

export interface JournalMonth {
  entries: JournalEntry[];
  /** «Октябрь: надой 1 200 л · 79 голов» */
  milk_l: number;
  total_heads: number;
}

/** «Куда попадут данные» — вычисляется чисто из NewEvent, без сети. */
export interface Destination {
  kind: 'journal' | 'form' | 'mercury' | 'household_book';
  label: string; // «Форма 3-фермер (рег) · следующий период»
  form_code?: FormCode;
}

// ─── Поголовье ──────────────────────────────────────────────────────────────

export interface HerdGroup {
  group: LivestockGroup;
  label: string; // «Коровы»
  hint: string; // «Дойное поголовье»
  heads: number;
}

export interface HerdSummary {
  on: IsoDate;
  total: number;
  groups: HerdGroup[];
}

/** Экран «Учет табуна» и превью 1-ТАБУН. */
export interface HorseHerd {
  period: { year: number; month: number };
  total: number;
  mares: number;
  young: number;
  stallions: number;
  opening: number;
  born: number;
  died: number;
  slaughtered: number;
  sold: number;
  purchased: number;
}

// ─── Отчётность ─────────────────────────────────────────────────────────────

export type FormCode =
  | '3-fermer' // Росстат, годовая
  | '3-fermer-month' // ежемесячная версия 3-фермер (рег)
  | '1-fermer'
  | '2-fermer'
  | '1-kfh' // Минсельхоз
  | '1-ip' // Минсельхоз
  | '1-tabun' // Сахастат, республиканская
  | '10-sh' // заготовка кормов
  | '1-iso-r';

export type ReportAuthority = 'rosstat' | 'minselhoz' | 'sakhastat';
export type ReportStatus = 'not_started' | 'draft' | 'submitted' | 'overdue' | 'failed';

export interface ReportPeriod {
  year: number;
  month?: number;
}

export interface ReportObligation {
  form_code: FormCode;
  title: string; // «Форма 10-СХ»
  description: string; // «Сведения о заготовке кормов»
  authority: ReportAuthority;
  scope: 'federal' | 'regional';
  period: ReportPeriod;
  due_on: IsoDate;
  status: ReportStatus;
  submitted_at: IsoDateTime | null;
  receipt_no: string | null;
  /** Есть официальный XLSX-бланк (скачивание через API). */
  has_official_blank: boolean;
}

export interface ReportPreviewRow {
  label: string;
  value: number | string;
  unit?: string; // «голов», «т», «л», «тыс. ₽»
}

export interface ReportPreview {
  form_code: FormCode;
  period: ReportPeriod;
  obligation: ReportObligation;
  sections: { title: string; rows: ReportPreviewRow[]; /** Пояснение под заголовком секции (необязательно). */ description?: string }[];
  /** «Баланс сходится: 29 + 6 − 1 − 2 = 32» */
  checks: { label: string; ok: boolean }[];
  /** Субъект отчёта: «ЛПХ Ивановых · с. Намцы». Если нет — UI берёт название хозяйства и населённый пункт. */
  respondent?: string;
  /** Информационные пояснения под превью («Сохраненная версия на дату сдачи…»). */
  notes?: string[];
  /** Квитанция, если отчёт уже сдан. */
  receipt?: Receipt | null;
}

export interface Receipt {
  receipt_no: string; // УЧ-ТАБУН-2026-023
  form_code: FormCode;
  period: ReportPeriod;
  recipient: string; // «Сахастат»
  submitted_at: IsoDateTime;
}

export type SubmitResult = { ok: true; receipt: Receipt } | { ok: false; error: 'network' | 'server'; message: string };

// ─── Похозяйственная книга (ЛПХ) ────────────────────────────────────────────

export interface HouseholdMember {
  id: Uuid;
  full_name: string;
  birth_date: IsoDate | null;
  /** «Глава ЛПХ», «Супруга», «Сын», «Сестра»… */
  relation: string;
  is_head: boolean;
  consent: boolean;
  /** Пояснение под ФИО: «Участие в ведении хозяйства» (необязательно). */
  note?: string | null;
}

export type NewHouseholdMember = Omit<HouseholdMember, 'id' | 'is_head'>;

export interface Household {
  farm: Farm;
  members: HouseholdMember[];
  livestock: HerdSummary;
}

export interface HouseholdExtract {
  url: string; // PDF
  generated_on: IsoDate;
}

// ─── ВетИС «Меркурий» ───────────────────────────────────────────────────────

export interface MercuryConnection {
  status: 'not_connected' | 'connected_demo';
  synced_at: IsoDateTime | null;
}

export interface MercuryDocument {
  id: Uuid;
  number: string; // УЧ-ВСД-023
  product: string; // «Молоко сырое»
  quantity: number;
  unit: string; // «л», «кг»
  status: 'issued' | 'redeemed';
  issued_on: IsoDate;
  produced_on: IsoDate | null;
  sender: string;
  recipient: string;
}

// ─── v3: ВетИС «Хорриот» (учёт животных) и связь с похозяйственной книгой ─────

export interface HorriotConnection {
  status: 'not_connected' | 'connected_demo';
  synced_at: IsoDateTime | null;
}

/** Учебная запись «Хорриота»: регистрация (рождение, покупка, начальный остаток) или выбытие животных. */
export interface HorriotRecord {
  id: Uuid;
  number: string; // УЧ-ХР-001
  kind: 'registration' | 'disposal';
  animal_group: LivestockGroup;
  group_label: string; // «Коровы»
  heads: number;
  reason: string; // «Рождение», «Продажа», «Начальный остаток»
  registered_on: IsoDate;
  source_movement_id: Uuid | null;
}

/** Строка сверки «книга ЛПХ ↔ Хорриот» на сегодня. diff = book_heads − horriot_heads. */
export interface HorriotReconciliationRow {
  animal_group: LivestockGroup;
  label: string;
  book_heads: number;
  horriot_heads: number;
  diff: number;
}

export interface HorriotState {
  connection: HorriotConnection;
  records: HorriotRecord[];
  reconciliation: HorriotReconciliationRow[];
  /** Сколько записей журнала поголовья ещё не передано в «Хорриот». */
  pending_count: number;
}

// ─── v3: админ-панель · модель помощника (OpenRouter) ───────────────────────

export interface AssistantModelOption {
  id: string; // «anthropic/claude-haiku-5.5», «…:free»
  name: string;
  free: boolean;
  context_length: number | null;
}

/** Глобальная настройка для всех пользователей. fallback_models — запасные модели по порядку. */
export interface AssistantModelSettings {
  model: string;
  fallback_models: string[];
  updated_at: IsoDateTime | null;
  updated_by: string | null; // email администратора
}

// ─── Профиль, уведомления, помощь ───────────────────────────────────────────

export interface AppNotification {
  id: Uuid;
  /** admin — рассылка или ответ поддержки из веб-панели администратора (v3.1). */
  kind: 'overdue' | 'deadline' | 'sync' | 'submitted' | 'admin';
  title: string;
  body: string;
  created_at: IsoDateTime;
  read: boolean;
  form_code?: FormCode;
}

export interface UserSettings {
  push_enabled: boolean;
  deadline_reminders: boolean;
  sound: boolean;
  text_size: 'standard' | 'large';
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface NewSupportTicket {
  topic: string;
  related_section: string | null;
  message: string;
  attachment_uri: string | null;
}

export interface SupportTicket extends NewSupportTicket {
  id: Uuid;
  number: string; // AGRO-2026-0142
  created_at: IsoDateTime;
}

// ─── Главный экран и синхронизация ──────────────────────────────────────────

export interface DashboardSummary {
  month_label: string; // «Октябрь 2026»
  federal: { submitted: number; total: number };
  regional: { overdue: number; total: number };
  milk_month_l: number;
  household: { name: string; cows: number; horses: number } | null;
  updated_at: IsoDateTime | null;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  last_synced_at: IsoDateTime | null;
  pending_changes: number;
  retry: () => Promise<void>;
}

// ─── Модуль данных: что экспортирует src/data/index.ts ──────────────────────

// ─── v2: регистрация и первое хозяйство (R1–R8) ─────────────────────────────

export interface SignUpInput {
  full_name: string;
  /** Телефон или email — реальный контакт (на него уходит код подтверждения). */
  contact: string;
  password: string;
  consent: boolean;
}

/**
 * Шаг онбординга после входа. null — всё готово, пускаем во вкладки.
 * 'role' → R3, 'farm' → R4 (создать или присоединиться), 'pending_access' → R8.
 */
export type OnboardingStep = 'role' | 'farm' | 'pending_access' | null;

export interface NewFarmInput {
  name: string;
  legal_status: LegalStatus;
  region: string;
  settlement: string;
  /** Для ЛПХ необязателен. */
  inn?: string | null;
}

/** Результат поиска хозяйства по коду приглашения (AGRO-0142) или ИНН — экран R7. */
export interface FarmLookup {
  farm_id: Uuid;
  name: string;
  region: string | null;
  settlement: string | null;
}

export interface JoinRequest {
  id: Uuid;
  farm_id: Uuid;
  farm_name: string;
  settlement: string | null;
  status: 'pending' | 'approved' | 'rejected';
  /** Контакт заявителя (R8). */
  contact: string | null;
  created_at: IsoDateTime;
}

// ─── v2: чат-помощник и голос (J1–J7) ───────────────────────────────────────

export interface DeadlineReminder {
  form_code: FormCode;
  title: string; // «1-ИСО-р»
  due_on: IsoDate;
  /** Отрицательное — просрочено на |days_left| дней. */
  days_left: number;
  status: ReportStatus;
}

export type ChatCard =
  | { kind: 'deadline'; reminder: DeadlineReminder }
  /** «Сохраненное событие» (J4): строки Тип / Животные / Количество / Дата / Журнал. */
  | { kind: 'saved_event'; entry_id: Uuid; rows: { label: string; value: string }[] }
  /** «Как подготовить отчет» (J6). */
  | { kind: 'how_to'; title: string; steps: string[] };

export interface ChatMessage {
  id: Uuid;
  role: 'user' | 'assistant';
  text: string;
  created_at: IsoDateTime;
  cards?: ChatCard[];
  /** Сообщение пользователя: отправлено / не отправлено (нет сети). */
  status?: 'sent' | 'failed';
  /** Сообщение пришло из голосовой записи. */
  from_voice?: boolean;
}

export interface VoiceClip {
  uri: string;
  mimeType: string; // 'audio/m4a', 'audio/webm' …
  durationMs: number;
}

export interface AssistantChat {
  messages: ChatMessage[];
  /** Подсказки-кнопки «Спросите помощника» (J1). */
  suggestions: string[];
  sending: boolean;
  error: string | null;
  /** Помощник доступен: есть сеть и сервер отвечает. Без сети UI показывает офлайн-плашку. */
  available: boolean;
  /**
   * Отправить текст. Если помощник распознал событие (например, надой), слой данных сам сохраняет
   * его через тот же путь, что и useCreateEvent (офлайн-очередь, журнал), и добавляет карточку
   * 'saved_event'. Если не хватает данных — ответ-уточнение (J5).
   */
  send: (text: string) => Promise<void>;
  /** Отправить голос: загрузка на сервер → распознавание → как send(text) с from_voice = true. */
  sendVoice: (clip: VoiceClip) => Promise<void>;
  /** «Отменить запись» на карточке сохранённого события (J4). */
  undoEvent: (entryId: Uuid) => Promise<void>;
  reset: () => void;
}

// ─── v2: напоминания (J8) и push ────────────────────────────────────────────

/** Настройки напоминаний — расширение UserSettings (все поля необязательны для совместимости). */
export interface ReminderSettings {
  reminders_in_chat?: boolean;
  remind_7_days?: boolean;
  remind_1_day?: boolean;
}

export interface DataModule {
  /** Оборачивает корневой layout: инициализирует локальную БД, сессию, синхронизацию. */
  DataProvider: ComponentType<{ children: ReactNode }>;

  useAuth: () => AuthApi;
  useSyncStatus: () => SyncStatus;

  useFarm: () => Query<Farm>;
  useUpdateFarm: () => Mutation<FarmUpdate, Farm>;
  /** Обновляет контакты профиля (email / телефон / имя). Добавлено агентом B для экрана F2. */
  useUpdateProfile: () => Mutation<ProfileUpdate, Profile>;
  useDashboard: () => Query<DashboardSummary>;

  useJournal: (filter: JournalFilter) => Query<JournalMonth>;
  useJournalEntry: (id: Uuid) => Query<JournalEntry | null>;
  useCreateEvent: () => Mutation<NewEvent, JournalEntry>;
  useUpdateEvent: () => Mutation<{ id: Uuid; input: NewEvent }, JournalEntry>;
  useDeleteEvent: () => Mutation<{ id: Uuid; type: EventType }, void>;
  /** Чистая функция без сети: для блока «Куда попадут данные». */
  getEventDestinations: (input: NewEvent, farm: Farm | null) => Destination[];

  useHerd: (on?: IsoDate) => Query<HerdSummary>;
  useHorseHerd: (period: { year: number; month: number }) => Query<HorseHerd>;

  useReports: (year: number) => Query<ReportObligation[]>;
  useReportPreview: (form: FormCode, period: ReportPeriod) => Query<ReportPreview>;
  useSubmitReport: () => Mutation<{ form: FormCode; period: ReportPeriod }, SubmitResult>;
  /** Ссылка на заполненный XLSX-бланк; null — у формы нет официального бланка. */
  getReportDownloadUrl: (form: FormCode, period: ReportPeriod) => Promise<string | null>;
  getReceiptUrl: (receiptNo: string) => Promise<string>;

  useHousehold: () => Query<Household>;
  useAddHouseholdMember: () => Mutation<NewHouseholdMember, HouseholdMember>;
  useHouseholdExtract: () => Mutation<void, HouseholdExtract>;

  useMercury: () => Query<{ connection: MercuryConnection; documents: MercuryDocument[] }>;
  useMercuryDocument: (id: Uuid) => Query<MercuryDocument | null>;
  useMercuryConnect: () => Mutation<void, MercuryConnection>;
  useMercuryRefresh: () => Mutation<void, MercuryConnection>;

  useNotifications: () => Query<AppNotification[]>;
  useMarkNotificationsRead: () => Mutation<{ ids?: Uuid[] }, void>;
  useSettings: () => Query<UserSettings>;
  useUpdateSettings: () => Mutation<Partial<UserSettings>, UserSettings>;
  useFaq: () => Query<FaqItem[]>;
  useCreateSupportTicket: () => Mutation<NewSupportTicket, SupportTicket>;

  // ── v2: вход по ИНН / email / телефону и регистрация (R1–R8) ──
  /** Вход по любому идентификатору: ИНН хозяйства, email или телефон. Заменяет signInWithInn в UI. */
  signIn: (identifier: string, password: string) => Promise<AuthResult>;
  /** R1: создаёт аккаунт и отправляет код на контакт. */
  signUp: (input: SignUpInput) => Promise<AuthResult & { maskedContact?: string; demoCode?: string }>;
  /** R2. После успеха пользователь в сессии. */
  verifySignUpCode: (contact: string, code: string) => Promise<AuthResult>;
  resendCode: (contact: string, purpose: 'signup' | 'recovery') => Promise<AuthResult & { demoCode?: string }>;
  /** Текущий шаг онбординга для редиректов в корневом layout. */
  useOnboardingStep: () => OnboardingStep;
  useCreateFarm: () => Mutation<NewFarmInput, Farm>;
  useFindFarm: () => Mutation<{ code_or_inn: string }, FarmLookup | null>;
  useRequestAccess: () => Mutation<{ farm_id: Uuid }, JoinRequest>;
  useMyJoinRequest: () => Query<JoinRequest | null>;

  // ── v2: помощник, напоминания, push ──
  useAssistantChat: () => AssistantChat;
  /** Ближайшие сроки и просрочки: блок «Помощник» на главной, карточки J1, предпросмотр J8. */
  useUpcomingDeadlines: () => Query<DeadlineReminder[]>;
  useReminderSettings: () => Query<ReminderSettings & Pick<UserSettings, 'push_enabled' | 'sound'>>;
  useUpdateReminderSettings: () => Mutation<ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>, void>;
  /** Регистрирует Expo push-токен устройства на сервере. Токен получает UI (expo-notifications). */
  registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') => Promise<void>;

  // ── v3: ВетИС «Хорриот» ──
  useHorriot: () => Query<HorriotState>;
  useHorriotConnect: () => Mutation<void, HorriotConnection>;
  useHorriotRefresh: () => Mutation<void, HorriotConnection>;

  // ── v3: админ-панель (модель помощника для всех) ──
  /** true, если id текущего пользователя есть в app_admins. Требует сети; офлайн — false. */
  useIsAdmin: () => Query<boolean>;
  useAssistantModelSettings: () => Query<AssistantModelSettings>;
  /** Модели OpenRouter с поддержкой tool calling (платные и :free). */
  useAssistantModelOptions: () => Query<AssistantModelOption[]>;
  useUpdateAssistantModelSettings: () => Mutation<Pick<AssistantModelSettings, 'model' | 'fallback_models'>, AssistantModelSettings>;
}
