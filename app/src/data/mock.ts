// Демо-реализация DataModule для UI (агент B): состояние в памяти, задержка ~300 мс, мутации меняют состояние.
// Ручная проверка служебных состояний:
//   globalThis.__AGRO_MOCK__ = { offline: true }   — экран G2 «Нет подключения»
//   globalThis.__AGRO_MOCK__ = { slow: true }      — экран G1 «Загрузка» (skeleton)
//   globalThis.__AGRO_MOCK__ = { failSubmit: true } — экран C8 «Не удалось отправить»
//   globalThis.__AGRO_MOCK__ = { signedIn: true }  — старт сразу в приложении (до первой загрузки)
// На вебе то же через адрес: ?mock=offline | slow | fail (можно через запятую): offline | slow | fail | in.
import { createElement, Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import {
  daysBetween,
  fmtDate,
  fmtDateLong,
  fmtHeads,
  fmtNum,
  headsWord,
  kgToLiters,
  litersToKg,
  monthName,
  plural,
  todayIso,
} from '../constants/format';
import type {
  AppNotification,
  AssistantChat,
  AuthApi,
  AuthResult,
  ChatCard,
  ChatMessage,
  CropEvent,
  DashboardSummary,
  DataModule,
  DeadlineReminder,
  Destination,
  Farm,
  FarmLookup,
  FarmUpdate,
  FaqItem,
  FeedEvent,
  FormCode,
  HerdGroup,
  HerdSummary,
  HorseHerd,
  Household,
  HouseholdExtract,
  HouseholdMember,
  IsoDate,
  IsoDateTime,
  JoinRequest,
  JournalEntry,
  JournalFilter,
  JournalMonth,
  LivestockEvent,
  LivestockGroup,
  MercuryConnection,
  MercuryDocument,
  Mutation,
  NewEvent,
  NewFarmInput,
  NewHouseholdMember,
  NewSupportTicket,
  OnboardingStep,
  Profile,
  ProfileUpdate,
  ProductOutputEvent,
  Query,
  Receipt,
  ReportObligation,
  ReportPeriod,
  ReportPreview,
  ReportPreviewRow,
  ReminderSettings,
  ReportStatus,
  SignUpInput,
  SubmitResult,
  SupportTicket,
  SyncStatus,
  UserRole,
  UserSettings,
  Uuid,
  VoiceClip,
} from './contract';

// ─── Флаги ручной проверки ──────────────────────────────────────────────────

interface MockFlags {
  offline?: boolean;
  slow?: boolean;
  failSubmit?: boolean;
  /** Стартовать уже авторизованным (роль владельца ЛПХ) — для проверки экранов без входа. */
  signedIn?: boolean;
}

const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

// Подписка на срез внешнего состояния. Значения должны читаться через такие селекторы:
// иначе React Compiler мемоизирует результат хука и не увидит изменений модульного состояния.
function useStore<T>(selector: () => T): T {
  return useSyncExternalStore(subscribe, selector, selector);
}

const flagsTarget: MockFlags = {};
const flagsProxy = new Proxy(flagsTarget, {
  set(target, prop, value) {
    (target as Record<string | symbol, unknown>)[prop] = value;
    emit();
    return true;
  },
});

const g = globalThis as unknown as { __AGRO_MOCK__?: MockFlags };
Object.defineProperty(g, '__AGRO_MOCK__', {
  configurable: true,
  get: () => flagsProxy,
  set: (value: MockFlags) => {
    for (const key of Object.keys(flagsTarget)) delete (flagsTarget as Record<string, unknown>)[key];
    Object.assign(flagsTarget, value ?? {});
    emit();
  },
});

(function readUrlFlags() {
  try {
    const search = (globalThis as { location?: { search?: string } }).location?.search;
    if (!search) return;
    const value = new URLSearchParams(search).get('mock');
    if (!value) return;
    const items = value.split(',');
    if (items.includes('offline')) flagsTarget.offline = true;
    if (items.includes('slow')) flagsTarget.slow = true;
    if (items.includes('fail')) flagsTarget.failSubmit = true;
    if (items.includes('in')) flagsTarget.signedIn = true;
  } catch {
    // не веб — флаги задаются через globalThis.__AGRO_MOCK__
  }
})();

const DELAY_MS = 300;
const SLOW_MS = 4000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Демо-данные ────────────────────────────────────────────────────────────

const DEMO_INN = '143512345660';
const DEMO_PASSWORD = 'AgroOkno2026!';
const DEMO_CODE = '261048';
/** «Сегодня» в демо — дата макета: сроки (7 дней, просрочка 3 дня) не зависят от реальных часов. */
const DEMO_TODAY: IsoDate = '2026-10-23';
const SYNC_AT: IsoDateTime = '2026-10-23T09:35:00+09:00';
const SUBMIT_AT: IsoDateTime = '2026-10-23T09:41:00+09:00';

const FARM_ID = 'farm-ivanov';
const USER_ID = 'user-ivanov';

const initialFarm: Farm = {
  id: FARM_ID,
  owner_id: USER_ID,
  legal_status: 'lph',
  name: 'ЛПХ Ивановых',
  inn: DEMO_INN,
  ogrn: null,
  okpo: null,
  oktmo: null,
  region: 'Республика Саха (Якутия)',
  settlement: 'с. Намцы',
  address: 'ул. Луговая, 12',
  head_name: 'Иван Иванов',
  book_record_no: '0142',
  cadastral_no: '14:18:010001:1248',
  plot_area_m2: 2500,
};

const initialProfile: Profile = {
  id: USER_ID,
  full_name: 'Иван Иванов',
  email: 'ivan@example.com',
  phone: null,
  role: null,
};

let eventSeq = 0;

function nextEventId(): Uuid {
  eventSeq += 1;
  return `ev-${String(eventSeq).padStart(4, '0')}`;
}

const LIVESTOCK_DEFAULTS = {
  live_weight_kg: null,
  amount_rub: null,
  counterparty: null,
  counterparty_inn: null,
  destination: null,
  vehicle_number: null,
  mercury_status: 'not_required',
} as const;

function livestock(
  date: IsoDate,
  group: LivestockGroup,
  kind: LivestockEvent['kind'],
  heads: number,
  created = '09:00',
): LivestockEvent {
  return {
    id: nextEventId(),
    farm_id: FARM_ID,
    type: 'livestock',
    occurred_on: date,
    note: null,
    created_at: `${date}T${created}:00+09:00`,
    pending_sync: false,
    animal_group: group,
    kind,
    heads,
    ...LIVESTOCK_DEFAULTS,
  };
}

function milk(date: IsoDate, liters: number, created = '09:20', note: string | null = null): ProductOutputEvent {
  return {
    id: nextEventId(),
    farm_id: FARM_ID,
    type: 'product_output',
    occurred_on: date,
    note,
    created_at: `${date}T${created}:00+09:00`,
    pending_sync: false,
    product: 'milk',
    quantity: litersToKg(liters),
    source_group: 'cattle_cows',
  };
}

function feed(
  date: IsoDate,
  kind: FeedEvent['feed'],
  tons: number,
  storage: string | null = 'Сеновал хозяйства',
): FeedEvent {
  return {
    id: nextEventId(),
    farm_id: FARM_ID,
    type: 'feed',
    occurred_on: date,
    note: null,
    created_at: `${date}T10:00:00+09:00`,
    pending_sync: false,
    feed: kind,
    operation: 'harvest',
    quantity_t: tons,
    storage_place: storage,
  };
}

function buildSeedEvents(): JournalEntry[] {
  const list: JournalEntry[] = [];
  // Остатки на начало года (приводят к данным макета: 15 коров, 8 телят, 29 лошадей на 30.09, 24 овцы).
  list.push(livestock('2026-01-01', 'cattle_cows', 'opening_balance', 15));
  list.push(livestock('2026-01-01', 'cattle_calves', 'opening_balance', 8));
  list.push(livestock('2026-01-01', 'horses_mares', 'opening_balance', 18));
  list.push(livestock('2026-01-01', 'horses_young', 'opening_balance', 5));
  list.push(livestock('2026-01-01', 'horses_stallions', 'opening_balance', 6));
  list.push(livestock('2026-01-01', 'sheep', 'opening_balance', 24));
  // Движение табуна в октябре: +6 родилось, −1 пало, −2 забито → 32.
  list.push(livestock('2026-10-05', 'horses_young', 'birth', 6, '08:30'));
  list.push(livestock('2026-10-12', 'horses_young', 'death', 1, '08:45'));
  list.push(livestock('2026-10-16', 'horses_stallions', 'slaughter', 2, '12:00'));
  // Надой: сентябрь — 1 080 л (три декады), октябрь — 1 200 л.
  list.push(milk('2026-09-10', 360, '20:00', 'Итог за декаду'));
  list.push(milk('2026-09-20', 360, '20:00', 'Итог за декаду'));
  list.push(milk('2026-09-30', 360, '20:00', 'Итог за декаду'));
  for (let day = 1; day <= 18; day += 1) {
    list.push(milk(`2026-10-${String(day).padStart(2, '0')}`, 60, '09:20'));
  }
  list.push(milk('2026-10-19', 38, '09:10'));
  list.push(milk('2026-10-21', 42, '09:15'));
  list.push(milk('2026-10-23', 40, '09:20', 'Утренний и вечерний надой, общий объем'));
  // Корма: сентябрьская версия 10-СХ — 18,0 + 6,0 + 1,2 = 25,2 т; 22.10 — 2,5 т сена (следующий период).
  list.push(feed('2026-08-20', 'hay', 18));
  list.push(feed('2026-08-28', 'haylage', 6));
  list.push(feed('2026-09-15', 'grain', 1.2));
  list.push(feed('2026-10-22', 'hay', 2.5));
  // Растениеводство.
  const crop: CropEvent = {
    id: nextEventId(),
    farm_id: FARM_ID,
    type: 'crop',
    occurred_on: '2026-10-20',
    note: null,
    created_at: '2026-10-20T15:00:00+09:00',
    pending_sync: false,
    plot_name: 'Огород · участок ЛПХ Ивановых',
    crop: 'Картофель',
    operation: 'harvest',
    area_ha: 0.1,
    yield_t: 1.8,
  };
  list.push(crop);
  return list;
}

const initialMembers: HouseholdMember[] = [
  {
    id: 'member-1',
    full_name: 'Иван Иванов',
    birth_date: '1986-03-12',
    relation: 'Глава ЛПХ',
    is_head: true,
    consent: true,
    note: 'Владелец рабочего пространства',
  },
  {
    id: 'member-2',
    full_name: 'Мария Иванова',
    birth_date: '1988-07-02',
    relation: 'Супруга',
    is_head: false,
    consent: true,
    note: 'Участие в ведении хозяйства',
  },
  {
    id: 'member-3',
    full_name: 'Алексей Иванов',
    birth_date: '2012-11-20',
    relation: 'Сын',
    is_head: false,
    consent: true,
    note: 'Член семьи главы хозяйства',
  },
];

const initialDocuments: MercuryDocument[] = [
  {
    id: 'vsd-023',
    number: 'УЧ-ВСД-023',
    product: 'Молоко сырое',
    quantity: 40,
    unit: 'л',
    status: 'issued',
    issued_on: '2026-10-23',
    produced_on: '2026-10-23',
    sender: 'ЛПХ Ивановых · учебный отправитель',
    recipient: 'Учебный получатель А · с. Намцы',
  },
  {
    id: 'vsd-022',
    number: 'УЧ-ВСД-022',
    product: 'Молоко сырое',
    quantity: 35,
    unit: 'л',
    status: 'redeemed',
    issued_on: '2026-10-22',
    produced_on: '2026-10-22',
    sender: 'ЛПХ Ивановых · учебный отправитель',
    recipient: 'Учебный получатель А · с. Намцы',
  },
  {
    id: 'vsd-021',
    number: 'УЧ-ВСД-021',
    product: 'Мясо говядины',
    quantity: 80,
    unit: 'кг',
    status: 'issued',
    issued_on: '2026-10-21',
    produced_on: '2026-10-20',
    sender: 'ЛПХ Ивановых · учебный отправитель',
    recipient: 'Учебный получатель Б · с. Намцы',
  },
];

const initialNotifications: AppNotification[] = [
  {
    id: 'n-1',
    kind: 'overdue',
    title: '1-ТАБУН просрочен',
    body: 'Срок был 20.10.2026. Просрочка 3 дня. Проверьте отчет и подтвердите отправку.',
    created_at: '2026-10-23T09:35:00+09:00',
    read: false,
    form_code: '1-tabun',
  },
  {
    id: 'n-2',
    kind: 'deadline',
    title: 'До сдачи 1-ИСО-р осталось 7 дней',
    body: 'Черновик подготовлен на основе учета хозяйства. Срок сдачи — 30.10.2026.',
    created_at: '2026-10-23T09:30:00+09:00',
    read: false,
    form_code: '1-iso-r',
  },
  {
    id: 'n-3',
    kind: 'sync',
    title: 'Учет синхронизирован',
    body: 'Сведения актуальны на 23.10.2026: 79 голов, надой за октябрь 1 200 л.',
    created_at: '2026-10-23T09:35:00+09:00',
    read: true,
  },
  {
    id: 'n-4',
    kind: 'submitted',
    title: '3-фермер (рег) сдан',
    body: 'Учебная квитанция за предыдущий период доступна в отчете.',
    created_at: '2026-10-16T14:05:00+09:00',
    read: true,
    form_code: '3-fermer-month',
  },
];

const faqItems: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Как работает единый ввод?',
    answer:
      'Сохраните событие один раз: сведения попадут в журнал и подготовленные показатели нужных форм.\n\nСданные отчеты не меняются задним числом. Перед новой отправкой вы проверяете период, данные и получателя, затем подтверждаете действие.',
  },
  {
    id: 'faq-2',
    question: 'Как исправить событие?',
    answer:
      'Откройте запись в журнале учета и нажмите «Редактировать». После сохранения итоги и черновики отчетов пересчитаются. Уже отправленные отчеты не изменятся.',
  },
  {
    id: 'faq-3',
    question: 'Что делать с просроченным отчетом?',
    answer:
      'Откройте отчет в разделе «Отчеты», проверьте данные и подтвердите отправку. Отметка о сдаче появится только после подтверждения; срок и статус «Просрочен» сохранятся в истории.',
  },
  {
    id: 'faq-4',
    question: 'Как получить выписку из книги?',
    answer:
      'В разделе «Мое ЛПХ» откройте вкладку «Скот» или «Участок» и нажмите «Выписка из книги». Документ формируется по актуальным сведениям и скачивается в PDF.',
  },
  {
    id: 'faq-5',
    question: 'Как подключить Меркурий?',
    answer:
      'Откройте «ВетИС Меркурий» на главном экране и нажмите «Подключить Меркурий». Пароль и ключи API в АгроОкно вводить не нужно — авторизация проходит на стороне провайдера.',
  },
];

// ─── Хранилище ──────────────────────────────────────────────────────────────

interface Submission {
  status: ReportStatus;
  submitted_at: IsoDateTime | null;
  receipt_no: string | null;
}

interface MockState {
  authStatus: AuthApi['status'];
  profile: Profile;
  password: string;
  farm: Farm;
  events: JournalEntry[];
  members: HouseholdMember[];
  submissions: Record<string, Submission>;
  mercury: MercuryConnection;
  documents: MercuryDocument[];
  notifications: AppNotification[];
  settings: UserSettings;
  tickets: SupportTicket[];
  recoveryContact: string | null;
  // v2
  /** Хозяйство у пользователя есть (создано в R5 или одобрен запрос R7). */
  hasFarm: boolean;
  /** В рабочем пространстве демо-данные ЛПХ Ивановых (иначе пустое хозяйство нового пользователя). */
  demoData: boolean;
  /** Зарегистрированный в R1 аккаунт (вход по контакту и паролю). */
  accountKind: 'demo' | 'new';
  account: { contact: string; password: string; name: string; email: string | null; phone: string | null } | null;
  pendingSignUp: { input: SignUpInput; code: string } | null;
  joinRequest: JoinRequest | null;
  joinChecks: number;
  reminders: Required<ReminderSettings>;
  chat: ChatState;
  pushToken: string | null;
}

interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  /** Помощник ждёт количество молока (J5). */
  awaiting: 'milk' | null;
}

function seedSubmissions(): Record<string, Submission> {
  return {
    '10-sh': { status: 'submitted', submitted_at: '2026-10-15T10:15:00+09:00', receipt_no: 'УЧ-10СХ-2026-015' },
    '1-ip': { status: 'submitted', submitted_at: '2026-10-12T11:40:00+09:00', receipt_no: 'УЧ-1ИП-2026-012' },
    '1-iso-r': { status: 'draft', submitted_at: null, receipt_no: null },
    '1-tabun': { status: 'not_started', submitted_at: null, receipt_no: null },
    '3-fermer-month': { status: 'submitted', submitted_at: '2026-10-16T14:05:00+09:00', receipt_no: 'УЧ-3ФР-2026-016' },
  };
}

const state: MockState = {
  authStatus: 'loading',
  profile: initialProfile,
  password: DEMO_PASSWORD,
  farm: initialFarm,
  events: buildSeedEvents(),
  members: initialMembers,
  submissions: seedSubmissions(),
  mercury: { status: 'not_connected', synced_at: null },
  documents: initialDocuments,
  notifications: initialNotifications,
  settings: { push_enabled: true, deadline_reminders: true, sound: false, text_size: 'standard' },
  tickets: [],
  recoveryContact: null,
  hasFarm: true,
  demoData: true,
  accountKind: 'demo',
  account: null,
  pendingSignUp: null,
  joinRequest: null,
  joinChecks: 0,
  reminders: { reminders_in_chat: true, remind_7_days: true, remind_1_day: true },
  chat: { messages: [], sending: false, error: null, awaiting: null },
  pushToken: null,
};

setTimeout(() => {
  if (flagsTarget.signedIn) {
    state.profile = { ...state.profile, role: 'lph_owner' };
    state.authStatus = 'signed_in';
  } else {
    state.authStatus = 'signed_out';
  }
  emit();
}, DELAY_MS);

function update(mutator: () => void): void {
  mutator();
  emit();
}

// ─── Общие хелперы запросов ─────────────────────────────────────────────────

const loadedKeys = new Set<string>();
const dataCache = new Map<string, { version: number; data: unknown }>();

function useQuery<T>(key: string, compute: () => T): Query<T> {
  const v = useStore(getVersion);
  const slow = useStore(() => flagsTarget.slow === true);
  const offline = useStore(() => flagsTarget.offline === true);
  const needLoad = slow || !loadedKeys.has(key);
  const [ready, setReady] = useState(!needLoad);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(
      () => {
        if (!slow) loadedKeys.add(key);
        setReady(true);
      },
      slow ? SLOW_MS : DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [ready, slow, key]);

  let data: T | undefined;
  if (ready) {
    const cached = dataCache.get(key);
    if (cached && cached.version === v) {
      data = cached.data as T;
    } else {
      data = compute();
      dataCache.set(key, { version: v, data });
    }
  }

  const refetch = useCallback(async () => {
    await wait(DELAY_MS);
    dataCache.delete(key);
    setTick((t) => t + 1);
  }, [key]);

  return {
    data,
    loading: !ready,
    fromCache: offline,
    error: null,
    refetch,
  };
}

function useMutation<I, O>(fn: (input: I) => O | Promise<O>): Mutation<I, O> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const run = useCallback(async (input: I): Promise<O> => {
    setPending(true);
    setError(null);
    try {
      await wait(DELAY_MS);
      return await fnRef.current(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
      throw e;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error };
}

// ─── Расчёты по событиям ────────────────────────────────────────────────────

const INCOMING = new Set<LivestockEvent['kind']>(['opening_balance', 'birth', 'purchase', 'transfer_in']);

function movementSign(kind: LivestockEvent['kind']): 1 | -1 {
  return INCOMING.has(kind) ? 1 : -1;
}

function lastDayOfMonth(year: number, month: number): IsoDate {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function livestockEvents(): LivestockEvent[] {
  return state.events.filter((e): e is LivestockEvent => e.type === 'livestock');
}

function headsOf(group: LivestockGroup, on: IsoDate): number {
  return livestockEvents()
    .filter((e) => e.animal_group === group && e.occurred_on <= on)
    .reduce((sum, e) => sum + movementSign(e.kind) * e.heads, 0);
}

const HERD_LABELS: Record<LivestockGroup, { label: string; hint: string }> = {
  cattle_cows: { label: 'Коровы', hint: 'Дойное поголовье' },
  cattle_calves: { label: 'Телята', hint: 'Молодняк КРС' },
  cattle_other: { label: 'КРС прочие', hint: 'Быки и нетели' },
  pigs_sows: { label: 'Свиноматки', hint: 'Свиньи' },
  pigs_other: { label: 'Свиньи прочие', hint: 'Свиньи' },
  sheep: { label: 'Овцы', hint: 'Взрослые и молодняк' },
  goats: { label: 'Козы', hint: 'Взрослые и молодняк' },
  horses_mares: { label: 'Кобылы', hint: 'Лошади' },
  horses_young: { label: 'Молодняк лошадей', hint: 'До 3 лет' },
  horses_stallions: { label: 'Жеребцы', hint: 'Взрослые жеребцы' },
  horses_other: { label: 'Лошади прочие', hint: 'Лошади' },
  deer: { label: 'Олени', hint: 'Северные олени' },
  poultry: { label: 'Птица', hint: 'Птица' },
  rabbits: { label: 'Кролики', hint: 'Кролики' },
};

const GROUP_ORDER: LivestockGroup[] = [
  'cattle_cows',
  'cattle_calves',
  'cattle_other',
  'horses_mares',
  'horses_young',
  'horses_stallions',
  'horses_other',
  'sheep',
  'goats',
  'pigs_sows',
  'pigs_other',
  'deer',
  'poultry',
  'rabbits',
];

const ALWAYS_SHOWN: LivestockGroup[] = [
  'cattle_cows',
  'cattle_calves',
  'horses_mares',
  'horses_young',
  'horses_stallions',
  'sheep',
];

function computeHerd(on: IsoDate): HerdSummary {
  const groups: HerdGroup[] = [];
  for (const group of GROUP_ORDER) {
    const heads = headsOf(group, on);
    if (heads > 0 || ALWAYS_SHOWN.includes(group)) {
      groups.push({ group, label: HERD_LABELS[group].label, hint: HERD_LABELS[group].hint, heads: Math.max(0, heads) });
    }
  }
  return { on, total: groups.reduce((s, x) => s + x.heads, 0), groups };
}

const HORSE_GROUPS: LivestockGroup[] = ['horses_mares', 'horses_young', 'horses_stallions', 'horses_other'];

function computeHorseHerd(period: { year: number; month: number }): HorseHerd {
  const first = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
  const last = lastDayOfMonth(period.year, period.month);
  const horse = livestockEvents().filter((e) => HORSE_GROUPS.includes(e.animal_group));
  const before = horse
    .filter((e) => e.occurred_on < first)
    .reduce((sum, e) => sum + movementSign(e.kind) * e.heads, 0);
  const inMonth = horse.filter((e) => e.occurred_on >= first && e.occurred_on <= last);
  const sumKind = (kinds: LivestockEvent['kind'][]) =>
    inMonth.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.heads, 0);
  const born = sumKind(['birth']);
  const purchased = sumKind(['purchase', 'transfer_in']);
  const died = sumKind(['death']);
  const slaughtered = sumKind(['slaughter', 'sale_slaughter']);
  const sold = sumKind(['sale', 'transfer_out']);
  return {
    period,
    total: before + born + purchased - died - slaughtered - sold,
    mares: headsOf('horses_mares', last),
    young: headsOf('horses_young', last),
    stallions: headsOf('horses_stallions', last),
    opening: before,
    born,
    died,
    slaughtered,
    sold,
    purchased,
  };
}

function monthMilkKg(year: number, month: number): number {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = lastDayOfMonth(year, month);
  return state.events
    .filter((e): e is ProductOutputEvent => e.type === 'product_output' && e.product === 'milk')
    .filter((e) => e.occurred_on >= first && e.occurred_on <= last)
    .reduce((s, e) => s + e.quantity, 0);
}

function monthMilkLiters(year: number, month: number): number {
  return kgToLiters(monthMilkKg(year, month));
}

function sortEntries(list: JournalEntry[]): JournalEntry[] {
  return [...list].sort((a, b) =>
    a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on),
  );
}

function computeJournal(filter: JournalFilter): JournalMonth {
  const first = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
  const last = lastDayOfMonth(filter.year, filter.month);
  const inMonth = state.events.filter((e) => {
    if (e.occurred_on < first || e.occurred_on > last) return false;
    if (e.type === 'livestock' && e.kind === 'opening_balance') return false;
    return true;
  });
  const entries = sortEntries(filter.type ? inMonth.filter((e) => e.type === filter.type) : inMonth);
  const today = todayIso();
  return {
    entries,
    milk_l: monthMilkLiters(filter.year, filter.month),
    total_heads: computeHerd(last > today ? today : last).total,
  };
}

// ─── Куда попадут данные ────────────────────────────────────────────────────

function computeDestinations(input: NewEvent): Destination[] {
  switch (input.type) {
    case 'livestock': {
      const list: Destination[] = [
        { kind: 'form', label: 'Форма 1-ИСО-р', form_code: '1-iso-r' },
        { kind: 'form', label: 'Форма 3-фермер (рег)', form_code: '3-fermer-month' },
      ];
      if (HORSE_GROUPS.includes(input.animal_group)) {
        list.push({ kind: 'form', label: 'Форма 1-ТАБУН', form_code: '1-tabun' });
      }
      list.push({ kind: 'mercury', label: 'Меркурий' });
      return list;
    }
    case 'product_output':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '3-фермер (рег) · следующий период', form_code: '3-fermer-month' },
      ];
    case 'product_sale':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '3-фермер (рег) · следующий период', form_code: '3-fermer-month' },
        { kind: 'mercury', label: 'Меркурий' },
      ];
    case 'feed':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: '10-СХ · следующий отчетный период', form_code: '10-sh' },
      ];
    case 'crop':
      return [
        { kind: 'journal', label: 'Журнал учета' },
        { kind: 'form', label: 'Раздел растениеводства · данные участка' },
      ];
  }
}

// ─── Отчётность ─────────────────────────────────────────────────────────────

interface FormMeta {
  title: string;
  description: string;
  authority: ReportObligation['authority'];
  scope: ReportObligation['scope'];
  period: ReportPeriod;
  due_on: IsoDate;
  has_official_blank: boolean;
  recipient: string;
  code: string;
}

const FORM_META: Partial<Record<FormCode, FormMeta>> = {
  '10-sh': {
    title: 'Форма 10-СХ',
    description: 'Сведения о заготовке кормов',
    authority: 'rosstat',
    scope: 'federal',
    period: { year: 2026, month: 9 },
    due_on: '2026-10-15',
    has_official_blank: false,
    recipient: 'Росстат',
    code: '10СХ',
  },
  '1-ip': {
    title: 'Форма 1-ИП',
    description: 'Сведения о деятельности хозяйства',
    authority: 'rosstat',
    scope: 'federal',
    period: { year: 2026, month: 9 },
    due_on: '2026-10-12',
    has_official_blank: true,
    recipient: 'Росстат',
    code: '1ИП',
  },
  '1-iso-r': {
    title: 'Форма 1-ИСО-р',
    description: 'Сведения о поголовье животных',
    authority: 'rosstat',
    scope: 'federal',
    period: { year: 2026, month: 10 },
    due_on: '2026-10-30',
    has_official_blank: false,
    recipient: 'Росстат',
    code: 'ИСО',
  },
  '1-tabun': {
    title: 'Форма 1-ТАБУН',
    description: 'Табунное коневодство',
    authority: 'sakhastat',
    scope: 'regional',
    period: { year: 2026, month: 10 },
    due_on: '2026-10-20',
    has_official_blank: false,
    recipient: 'Сахастат',
    code: 'ТАБУН',
  },
  '3-fermer-month': {
    title: 'Форма 3-фермер (рег)',
    description: 'Производство продукции · региональная',
    authority: 'sakhastat',
    scope: 'regional',
    period: { year: 2026, month: 9 },
    due_on: '2026-10-16',
    has_official_blank: false,
    recipient: 'Сахастат',
    code: '3ФР',
  },
};

const FORM_ORDER: FormCode[] = ['10-sh', '1-ip', '1-iso-r', '1-tabun', '3-fermer-month'];
const RECEIPT_NUMBERS: Partial<Record<FormCode, string>> = { '1-tabun': '023' };

function obligationFor(form: FormCode): ReportObligation | null {
  const meta = FORM_META[form];
  if (!meta) return null;
  const sub = state.submissions[form] ?? { status: 'not_started', submitted_at: null, receipt_no: null };
  let status: ReportStatus = sub.status;
  if ((status === 'not_started' || status === 'draft') && meta.due_on < DEMO_TODAY) status = 'overdue';
  let description = meta.description;
  if (form === '1-tabun') {
    const total = computeHorseHerd({ year: 2026, month: 10 }).total;
    description = `Табунное коневодство · ${total} ${plural(total, ['лошадь', 'лошади', 'лошадей'])}`;
  }
  return {
    form_code: form,
    title: meta.title,
    description,
    authority: meta.authority,
    scope: meta.scope,
    period: meta.period,
    due_on: meta.due_on,
    status,
    submitted_at: sub.submitted_at,
    receipt_no: sub.receipt_no,
    has_official_blank: meta.has_official_blank,
  };
}

function computeObligations(year: number): ReportObligation[] {
  if (year !== 2026 || !state.demoData) return [];
  return FORM_ORDER.map((f) => obligationFor(f)).filter((x): x is ReportObligation => x !== null);
}

function row(label: string, value: number | string, unit?: string): ReportPreviewRow {
  return unit ? { label, value, unit } : { label, value };
}

function feedTotalsUntil(last: IsoDate): { hay: number; haylage: number; grain: number } {
  const sum = (kind: FeedEvent['feed']) =>
    state.events
      .filter((e): e is FeedEvent => e.type === 'feed' && e.feed === kind && e.operation === 'harvest')
      .filter((e) => e.occurred_on <= last)
      .reduce((s, e) => s + e.quantity_t, 0);
  return { hay: sum('hay'), haylage: sum('haylage'), grain: sum('grain') };
}

function headsRow(label: string, n: number): ReportPreviewRow {
  return row(label, n, headsWord(n));
}

function computePreview(form: FormCode, period: ReportPeriod): ReportPreview | null {
  const obligation = obligationFor(form);
  if (!obligation) return null;
  const sub = state.submissions[form];
  const receipt: Receipt | null =
    sub?.status === 'submitted' && sub.receipt_no && sub.submitted_at
      ? {
          receipt_no: sub.receipt_no,
          form_code: form,
          period: obligation.period,
          recipient: FORM_META[form]?.recipient ?? '',
          submitted_at: sub.submitted_at,
        }
      : null;
  const month = period.month ?? obligation.period.month ?? 10;
  const year = period.year;
  const last = lastDayOfMonth(year, month);
  const base = { form_code: form, period, obligation, receipt, respondent: `${state.farm.name} · ${state.farm.settlement ?? ''}`.trim() };

  switch (form) {
    case '1-tabun': {
      const h = computeHorseHerd({ year, month });
      const balance = `${h.opening} + ${h.born} − ${h.died} − ${h.slaughtered} = ${h.total}`;
      return {
        ...base,
        sections: [
          {
            title: 'Движение табуна',
            rows: [
              headsRow('На начало периода', h.opening),
              headsRow('Родилось', h.born),
              headsRow('Пало', h.died),
              headsRow('Забито', h.slaughtered),
              headsRow('На конец периода', h.total),
            ],
          },
          {
            title: 'Состав табуна',
            rows: [headsRow('Кобылы', h.mares), headsRow('Молодняк до 3 лет', h.young), headsRow('Взрослые жеребцы', h.stallions)],
          },
        ],
        checks: [{ label: `Баланс сходится: ${balance}. Все движения уже учтены в журнале.`, ok: h.opening + h.born - h.died - h.slaughtered === h.total }],
      };
    }
    case '10-sh': {
      const t = feedTotalsUntil(last);
      const total = Math.round((t.hay + t.haylage + t.grain) * 10) / 10;
      return {
        ...base,
        sections: [
          {
            title: 'Заготовка кормов',
            rows: [
              row('Сено', fmtNum(t.hay, 1), 'т'),
              row('Сенаж', fmtNum(t.haylage, 1), 'т'),
              row('Зерно на корм', fmtNum(t.grain, 1), 'т'),
              row('Всего, натуральный вес', fmtNum(total, 1), 'т'),
            ],
          },
        ],
        checks: [],
        notes: ['Сохраненная версия на дату сдачи. Заготовка 2,5 т сена от 22.10 относится к следующему периоду и здесь не учтена.'],
      };
    }
    case '1-ip':
      return {
        ...base,
        respondent: 'ИП «Учебный респондент» · с. Намцы',
        sections: [
          {
            title: 'ИП «Учебный респондент»',
            description: 'ИНН 143512345660 · учебный пример\nРеспондент КФХ / ИП в том же демонстрационном рабочем пространстве.',
            rows: [],
          },
          {
            title: 'Показатели деятельности',
            rows: [row('Вид деятельности', 'Сельское хозяйство'), row('Работники', 2, 'чел.'), row('Выручка за период', fmtNum(86.4, 1), 'тыс. ₽')],
          },
        ],
        checks: [],
        notes: ['Не является обязанностью любого ЛПХ. Форма показана для отдельного учебного респондента КФХ / ИП, а не для статуса ЛПХ Ивановых.'],
      };
    case '1-iso-r': {
      const herd = computeHerd(last > todayIso() ? todayIso() : last);
      const cows = herd.groups.find((x) => x.group === 'cattle_cows')?.heads ?? 0;
      const calves = herd.groups.find((x) => x.group === 'cattle_calves')?.heads ?? 0;
      const sheep = herd.groups.find((x) => x.group === 'sheep')?.heads ?? 0;
      const horses = herd.groups.filter((x) => HORSE_GROUPS.includes(x.group)).reduce((s, x) => s + x.heads, 0);
      return {
        ...base,
        sections: [
          {
            title: 'Автозаполненные данные',
            rows: [
              headsRow('Коровы', cows),
              headsRow('Телята', calves),
              headsRow('Лошади', horses),
              headsRow('Овцы', sheep),
              headsRow('Всего животных', herd.total),
            ],
          },
        ],
        checks: [
          { label: `Сумма по группам: ${cows} + ${calves} + ${horses} + ${sheep} = ${herd.total}`, ok: cows + calves + horses + sheep === herd.total },
          { label: 'Сведения совпадают с книгой ЛПХ', ok: true },
        ],
      };
    }
    case '3-fermer-month': {
      const herd = computeHerd(last);
      const cows = herd.groups.find((x) => x.group === 'cattle_cows')?.heads ?? 0;
      const calves = herd.groups.find((x) => x.group === 'cattle_calves')?.heads ?? 0;
      const sheep = herd.groups.find((x) => x.group === 'sheep')?.heads ?? 0;
      const horses = herd.groups.filter((x) => HORSE_GROUPS.includes(x.group)).reduce((s, x) => s + x.heads, 0);
      return {
        ...base,
        sections: [
          {
            title: `Показатели за ${monthNominativeLower(month)}`,
            rows: [
              headsRow('Коровы на конец периода', cows),
              headsRow('Телята', calves),
              headsRow('Лошади', horses),
              headsRow('Овцы', sheep),
              row(`Надой за ${monthNominativeLower(month)}`, fmtNum(monthMilkLiters(year, month)), 'л'),
            ],
          },
        ],
        checks: [],
        notes: [
          `Учебные данные прошлого периода. Надой ${fmtNum(monthMilkLiters(2026, 10))} л и ${computeHorseHerd({ year: 2026, month: 10 }).total} лошади из текущего октября не заменят сохраненную версию этого отчета.`,
        ],
      };
    }
    default:
      return {
        ...base,
        sections: [],
        checks: [],
      };
  }
}

function monthNominativeLower(month: number): string {
  return monthName(month).toLowerCase();
}

function submitReport(form: FormCode, period: ReportPeriod): SubmitResult {
  if (flagsTarget.offline) {
    return { ok: false, error: 'network', message: 'Нет подключения к сети. Данные сохранены локально.' };
  }
  if (flagsTarget.failSubmit) {
    return { ok: false, error: 'network', message: 'Нет ответа от сервиса. Проверьте подключение к интернету и попробуйте еще раз.' };
  }
  const meta = FORM_META[form];
  if (!meta) return { ok: false, error: 'server', message: 'Форма не найдена' };
  const number = RECEIPT_NUMBERS[form] ?? String(100 + Object.keys(state.submissions).length);
  const receipt: Receipt = {
    receipt_no: `УЧ-${meta.code}-2026-${number}`,
    form_code: form,
    period,
    recipient: meta.recipient,
    submitted_at: SUBMIT_AT,
  };
  update(() => {
    state.submissions[form] = { status: 'submitted', submitted_at: SUBMIT_AT, receipt_no: receipt.receipt_no };
    state.notifications = [
      {
        id: `n-${state.notifications.length + 1}`,
        kind: 'submitted',
        title: `${meta.title.replace('Форма ', '')} отправлен`,
        body: `Учебная квитанция ${receipt.receipt_no} доступна в отчете.`,
        created_at: SUBMIT_AT,
        read: false,
        form_code: form,
      },
      ...state.notifications,
    ];
  });
  return { ok: true, receipt };
}

// ─── Авторизация ────────────────────────────────────────────────────────────

function maskContact(contact: string): string {
  const trimmed = contact.trim();
  const at = trimmed.indexOf('@');
  if (at > 0) return `${trimmed[0]}***${trimmed.slice(at)}`;
  const digits = trimmed.replace(/\D/g, '');
  return `+7 *** ***-**-${digits.slice(-2)}`;
}

type AuthFail = Extract<AuthResult, { ok: false }>;

function fail(error: AuthFail['error'], message: string): AuthFail {
  return { ok: false, error, message };
}

function useAuthMock(): AuthApi {
  const authStatus = useStore(() => state.authStatus);
  const profile = useStore(() => state.profile);
  const farm = useStore(() => state.farm);
  const hasFarm = useStore(() => state.hasFarm);
  const signedIn = authStatus === 'signed_in';
  return {
    status: authStatus,
    profile: signedIn ? profile : null,
    farm: signedIn && hasFarm ? farm : null,
    signInWithInn: (inn, password) => signInMock(inn, password),
    requestRecovery: async (contact) => {
      await wait(DELAY_MS);
      const trimmed = contact.trim();
      const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) || trimmed.replace(/\D/g, '').length >= 10;
      if (!valid) return { ...fail('contact_not_found', 'Контакт не найден. Проверьте телефон или email'), };
      state.recoveryContact = trimmed;
      return { ok: true, maskedContact: maskContact(trimmed), demoCode: DEMO_CODE };
    },
    verifyRecoveryCode: async (_contact, code) => {
      await wait(DELAY_MS);
      if (code !== DEMO_CODE) return fail('invalid_code', 'Неверный код. Проверьте цифры');
      update(() => {
        state.authStatus = 'signed_in';
      });
      return { ok: true };
    },
    setNewPassword: async (password) => {
      await wait(DELAY_MS);
      if (password.length < 8 || !/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) {
        return fail('weak_password', 'Пароль слишком простой');
      }
      state.password = password;
      return { ok: true };
    },
    setRole: async (role: UserRole) => {
      await wait(DELAY_MS);
      update(() => {
        state.profile = { ...state.profile, role };
      });
      return { ok: true };
    },
    signOut: async () => {
      await wait(100);
      update(() => {
        state.authStatus = 'signed_out';
      });
    },
  };
}

// ─── Хуки ───────────────────────────────────────────────────────────────────

function DataProvider({ children }: { children: ReactNode }) {
  return createElement(Fragment, null, children);
}

function useSyncStatusMock(): SyncStatus {
  const offline = useStore(() => flagsTarget.offline === true);
  const pending = useStore(() => state.events.filter((e) => e.pending_sync).length);
  const retry = useCallback(async () => {
    await wait(700);
    flagsTarget.offline = false;
    emit();
  }, []);
  return {
    online: !offline,
    syncing: false,
    last_synced_at: SYNC_AT,
    pending_changes: pending,
    retry,
  };
}

function useFarmMock(): Query<Farm> {
  return useQuery('farm', () => state.farm);
}

function useUpdateFarmMock(): Mutation<FarmUpdate, Farm> {
  return useMutation((input: FarmUpdate) => {
    update(() => {
      state.farm = { ...state.farm, ...input };
    });
    return state.farm;
  });
}

function useUpdateProfileMock(): Mutation<ProfileUpdate, Profile> {
  return useMutation((input: ProfileUpdate) => {
    update(() => {
      state.profile = { ...state.profile, ...input };
    });
    return state.profile;
  });
}

function useDashboardMock(): Query<DashboardSummary> {
  return useQuery('dashboard', () => {
    const obligations = computeObligations(2026);
    const federal = obligations.filter((o) => o.scope === 'federal');
    const regional = obligations.filter((o) => o.scope === 'regional');
    const herd = computeHerd(todayIso());
    const cows = herd.groups.find((g2) => g2.group === 'cattle_cows')?.heads ?? 0;
    const horses = herd.groups.filter((x) => HORSE_GROUPS.includes(x.group)).reduce((s, x) => s + x.heads, 0);
    return {
      month_label: 'Октябрь 2026',
      federal: { submitted: federal.filter((o) => o.status === 'submitted').length, total: federal.length },
      regional: { overdue: regional.filter((o) => o.status === 'overdue').length, total: regional.length },
      milk_month_l: monthMilkLiters(2026, 10),
      household: { name: state.farm.name, cows, horses },
      updated_at: SYNC_AT,
    } satisfies DashboardSummary;
  });
}

function useJournalMock(filter: JournalFilter): Query<JournalMonth> {
  return useQuery(`journal:${filter.year}-${filter.month}:${filter.type ?? 'all'}`, () => computeJournal(filter));
}

function useJournalEntryMock(id: Uuid): Query<JournalEntry | null> {
  return useQuery(`entry:${id}`, () => state.events.find((e) => e.id === id) ?? null);
}

function materialize(input: NewEvent, id: Uuid, created_at: IsoDateTime): JournalEntry {
  return {
    ...input,
    id,
    farm_id: FARM_ID,
    created_at,
    pending_sync: flagsTarget.offline === true,
  } as JournalEntry;
}

function useCreateEventMock(): Mutation<NewEvent, JournalEntry> {
  return useMutation((input: NewEvent) => {
    const entry = materialize(input, nextEventId(), `${todayIso()}T09:50:00+09:00`);
    update(() => {
      state.events = [...state.events, entry];
    });
    return entry;
  });
}

function useUpdateEventMock(): Mutation<{ id: Uuid; input: NewEvent }, JournalEntry> {
  return useMutation(({ id, input }: { id: Uuid; input: NewEvent }) => {
    const old = state.events.find((e) => e.id === id);
    const entry = materialize(input, id, old?.created_at ?? `${todayIso()}T09:50:00+09:00`);
    update(() => {
      state.events = state.events.map((e) => (e.id === id ? entry : e));
    });
    return entry;
  });
}

function useDeleteEventMock(): Mutation<{ id: Uuid; type: JournalEntry['type'] }, void> {
  return useMutation(({ id }: { id: Uuid; type: JournalEntry['type'] }) => {
    update(() => {
      state.events = state.events.filter((e) => e.id !== id);
    });
  });
}

function useHerdMock(on?: IsoDate): Query<HerdSummary> {
  const date = on ?? todayIso();
  return useQuery(`herd:${date}`, () => computeHerd(date));
}

function useHorseHerdMock(period: { year: number; month: number }): Query<HorseHerd> {
  return useQuery(`horse:${period.year}-${period.month}`, () => computeHorseHerd(period));
}

function useReportsMock(year: number): Query<ReportObligation[]> {
  return useQuery(`reports:${year}`, () => computeObligations(year));
}

function useReportPreviewMock(form: FormCode, period: ReportPeriod): Query<ReportPreview> {
  return useQuery(`preview:${form}:${period.year}-${period.month ?? 0}`, () => {
    const preview = computePreview(form, period);
    if (!preview) throw new Error('Форма не найдена');
    return preview;
  });
}

function useSubmitReportMock(): Mutation<{ form: FormCode; period: ReportPeriod }, SubmitResult> {
  return useMutation(({ form, period }: { form: FormCode; period: ReportPeriod }) => submitReport(form, period));
}

async function getReportDownloadUrlMock(form: FormCode, period: ReportPeriod): Promise<string | null> {
  await wait(DELAY_MS);
  const meta = FORM_META[form];
  if (!meta || !meta.has_official_blank) return null;
  const preview = computePreview(form, period);
  const text = [
    `АгроОкно · ${meta.title} · учебный бланк`,
    '',
    ...(preview?.sections.flatMap((s) => [s.title, ...s.rows.map((r) => `  ${r.label}: ${r.value} ${r.unit ?? ''}`)]) ?? []),
  ].join('\n');
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

async function getReceiptUrlMock(receiptNo: string): Promise<string> {
  await wait(DELAY_MS);
  const text = `АгроОкно · учебная квитанция\n${receiptNo}\nДокумент демонстрационный, юридической силы не имеет.`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

function useHouseholdMock(): Query<Household> {
  return useQuery('household', () => ({
    farm: state.farm,
    members: state.members,
    livestock: computeHerd(todayIso()),
  }));
}

function useAddHouseholdMemberMock(): Mutation<NewHouseholdMember, HouseholdMember> {
  return useMutation((input: NewHouseholdMember) => {
    const member: HouseholdMember = {
      ...input,
      id: `member-${state.members.length + 1}`,
      is_head: false,
      note: input.note ?? 'Член семьи главы хозяйства',
    };
    update(() => {
      state.members = [...state.members, member];
    });
    return member;
  });
}

function useHouseholdExtractMock(): Mutation<void, HouseholdExtract> {
  return useMutation(() => {
    const herd = computeHerd(todayIso());
    const lines = [
      'Выписка из похозяйственной книги (учебный документ)',
      `Запись № ${state.farm.book_record_no} · ${fmtDate(todayIso())}`,
      `${state.farm.name}, ${state.farm.region}, ${state.farm.address}`,
      `Участок: ${state.farm.plot_area_m2} кв.м, кадастровый номер ${state.farm.cadastral_no}`,
      `Члены хозяйства: ${state.members.map((m) => `${m.full_name} — ${m.relation}`).join('; ')}`,
      `Поголовье: ${herd.groups.map((x) => `${x.label} ${x.heads}`).join(', ')}; всего ${fmtHeads(herd.total)}`,
      'Документ не имеет юридической силы.',
    ];
    return {
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`,
      generated_on: todayIso(),
    };
  });
}

function useMercuryMock(): Query<{ connection: MercuryConnection; documents: MercuryDocument[] }> {
  return useQuery('mercury', () => ({ connection: state.mercury, documents: state.documents }));
}

function useMercuryDocumentMock(id: Uuid): Query<MercuryDocument | null> {
  return useQuery(`mercury-doc:${id}`, () => state.documents.find((d) => d.id === id) ?? null);
}

function useMercuryConnectMock(): Mutation<void, MercuryConnection> {
  return useMutation(() => {
    update(() => {
      state.mercury = { status: 'connected_demo', synced_at: SYNC_AT };
    });
    return state.mercury;
  });
}

function useMercuryRefreshMock(): Mutation<void, MercuryConnection> {
  return useMutation(() => {
    update(() => {
      state.mercury = { status: 'connected_demo', synced_at: SUBMIT_AT };
    });
    return state.mercury;
  });
}

function useNotificationsMock(): Query<AppNotification[]> {
  return useQuery('notifications', () => state.notifications);
}

function useMarkNotificationsReadMock(): Mutation<{ ids?: Uuid[] }, void> {
  return useMutation(({ ids }: { ids?: Uuid[] }) => {
    update(() => {
      state.notifications = state.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n));
    });
  });
}

function useSettingsMock(): Query<UserSettings> {
  return useQuery('settings', () => state.settings);
}

function useUpdateSettingsMock(): Mutation<Partial<UserSettings>, UserSettings> {
  return useMutation((input: Partial<UserSettings>) => {
    update(() => {
      state.settings = { ...state.settings, ...input };
      if (input.deadline_reminders !== undefined) {
        state.reminders = { ...state.reminders, remind_7_days: input.deadline_reminders, remind_1_day: input.deadline_reminders };
      }
    });
    return state.settings;
  });
}

function useFaqMock(): Query<FaqItem[]> {
  return useQuery('faq', () => faqItems);
}

function useCreateSupportTicketMock(): Mutation<NewSupportTicket, SupportTicket> {
  return useMutation((input: NewSupportTicket) => {
    const ticket: SupportTicket = {
      ...input,
      id: `ticket-${state.tickets.length + 1}`,
      number: `AGRO-2026-${String(142 + state.tickets.length).padStart(4, '0')}`,
      created_at: SUBMIT_AT,
    };
    update(() => {
      state.tickets = [...state.tickets, ticket];
    });
    return ticket;
  });
}

// ─── v2: регистрация, онбординг, хозяйство (R1–R8) ──────────────────────────

const SIGNUP_CODE = '248163';
const INVITE_CODE = 'AGRO-0142';
const NEW_USER_ID = 'user-new';
const NEW_FARM_ID = 'farm-new';

const isEmail = (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
const isPhone = (value: string): boolean => value.replace(/\D/g, '').length >= 10;

function normalizeContact(contact: string): string {
  const trimmed = contact.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
}

function loadDemoWorkspace(): void {
  state.farm = initialFarm;
  state.events = buildSeedEvents();
  state.members = initialMembers;
  state.submissions = seedSubmissions();
  state.documents = initialDocuments;
  state.notifications = initialNotifications;
  state.demoData = true;
  state.hasFarm = true;
}

function loadBlankWorkspace(): void {
  state.events = [];
  state.members = [];
  state.submissions = {};
  state.documents = [];
  state.notifications = [];
  state.demoData = false;
  state.hasFarm = false;
  state.joinRequest = null;
  state.joinChecks = 0;
}

function enterDemo(): void {
  update(() => {
    if (state.accountKind !== 'demo') {
      state.accountKind = 'demo';
      state.profile = initialProfile;
      loadDemoWorkspace();
    }
    state.authStatus = 'signed_in';
    resetChatState();
  });
}

async function signInMock(identifier: string, password: string): Promise<AuthResult> {
  await wait(DELAY_MS);
  if (flagsTarget.offline) return fail('network', 'Нет подключения к сети');
  const id = identifier.trim();
  if (!id || !password) return fail('invalid_credentials', 'Введите ИНН, email или телефон и пароль');
  if (/^\d{10}$|^\d{12}$/.test(id)) {
    if (id === DEMO_INN && password === state.password) {
      enterDemo();
      return { ok: true };
    }
    return fail('invalid_credentials', 'Неверный ИНН или пароль');
  }
  if (!isEmail(id) && !isPhone(id)) {
    return fail('invalid_credentials', 'Проверьте ИНН, email или телефон');
  }
  const contact = normalizeContact(id);
  if (contact === normalizeContact(initialProfile.email ?? '') && password === state.password) {
    enterDemo();
    return { ok: true };
  }
  const account = state.account;
  if (account && account.contact === contact && password === account.password) {
    update(() => {
      if (state.accountKind !== 'new') {
        state.accountKind = 'new';
        state.profile = { id: NEW_USER_ID, full_name: account.name, email: account.email, phone: account.phone, role: null };
        loadBlankWorkspace();
      }
      state.authStatus = 'signed_in';
      resetChatState();
    });
    return { ok: true };
  }
  return fail('invalid_credentials', 'Неверный логин или пароль');
}

async function signUpMock(input: SignUpInput): Promise<AuthResult & { maskedContact?: string; demoCode?: string }> {
  await wait(DELAY_MS);
  if (flagsTarget.offline) return fail('network', 'Нет подключения к сети');
  if (input.full_name.trim().split(/\s+/).filter(Boolean).length < 2) return fail('unknown', 'Укажите имя и фамилию');
  if (!isEmail(input.contact) && !isPhone(input.contact)) return fail('contact_not_found', 'Проверьте телефон или email');
  if (input.password.length < 8 || !/[A-Za-zА-Яа-я]/.test(input.password) || !/\d/.test(input.password)) {
    return fail('weak_password', 'Пароль слишком простой');
  }
  if (!input.consent) return fail('unknown', 'Нужно согласие на обработку персональных данных');
  state.pendingSignUp = { input, code: SIGNUP_CODE };
  return { ok: true, maskedContact: maskContact(input.contact), demoCode: SIGNUP_CODE };
}

async function verifySignUpCodeMock(contact: string, code: string): Promise<AuthResult> {
  await wait(DELAY_MS);
  const pending = state.pendingSignUp;
  if (!pending || normalizeContact(contact) !== normalizeContact(pending.input.contact) || code !== pending.code) {
    return fail('invalid_code', 'Неверный код. Проверьте цифры');
  }
  const email = isEmail(pending.input.contact) ? pending.input.contact.trim() : null;
  const account = {
    contact: normalizeContact(pending.input.contact),
    password: pending.input.password,
    name: pending.input.full_name.trim(),
    email,
    phone: email ? null : pending.input.contact.trim(),
  };
  update(() => {
    state.account = account;
    state.pendingSignUp = null;
    state.accountKind = 'new';
    state.profile = { id: NEW_USER_ID, full_name: account.name, email: account.email, phone: account.phone, role: null };
    loadBlankWorkspace();
    state.authStatus = 'signed_in';
    resetChatState();
  });
  return { ok: true };
}

async function resendCodeMock(_contact: string, purpose: 'signup' | 'recovery'): Promise<AuthResult & { demoCode?: string }> {
  await wait(DELAY_MS);
  return { ok: true, demoCode: purpose === 'signup' ? SIGNUP_CODE : DEMO_CODE };
}

function computeOnboardingStep(): OnboardingStep {
  if (state.authStatus !== 'signed_in') return null;
  if (!state.profile.role) return 'role';
  if (!state.hasFarm) return state.joinRequest?.status === 'pending' ? 'pending_access' : 'farm';
  return null;
}

function useOnboardingStepMock(): OnboardingStep {
  return useStore(computeOnboardingStep);
}

function useCreateFarmMock(): Mutation<NewFarmInput, Farm> {
  return useMutation((input: NewFarmInput) => {
    if (!input.name.trim()) throw new Error('Введите название хозяйства');
    const farm: Farm = {
      id: NEW_FARM_ID,
      owner_id: state.profile.id,
      legal_status: input.legal_status,
      name: input.name.trim(),
      inn: input.inn?.trim() || null,
      ogrn: null,
      okpo: null,
      oktmo: null,
      region: input.region,
      settlement: input.settlement,
      address: null,
      head_name: state.profile.full_name,
      book_record_no: input.legal_status === 'lph' ? '0143' : null,
      cadastral_no: null,
      plot_area_m2: null,
    };
    update(() => {
      state.farm = farm;
      state.hasFarm = true;
      state.joinRequest = null;
      state.members = [
        {
          id: 'member-1',
          full_name: state.profile.full_name ?? 'Владелец',
          birth_date: null,
          relation: 'Глава ЛПХ',
          is_head: true,
          consent: true,
          note: 'Владелец рабочего пространства',
        },
      ];
    });
    return farm;
  });
}

function useFindFarmMock(): Mutation<{ code_or_inn: string }, FarmLookup | null> {
  return useMutation(({ code_or_inn }: { code_or_inn: string }) => {
    const query = code_or_inn.trim().toUpperCase().replace(/\s+/g, '');
    if (query === INVITE_CODE || query === 'AGRO0142' || query === DEMO_INN) {
      return { farm_id: FARM_ID, name: 'ЛПХ Ивановых', region: 'Республика Саха (Якутия)', settlement: 'с. Намцы' } satisfies FarmLookup;
    }
    return null;
  });
}

function useRequestAccessMock(): Mutation<{ farm_id: Uuid }, JoinRequest> {
  return useMutation(({ farm_id }: { farm_id: Uuid }) => {
    if (farm_id !== FARM_ID) throw new Error('Хозяйство не найдено');
    const request: JoinRequest = {
      id: 'join-1',
      farm_id,
      farm_name: 'ЛПХ Ивановых',
      settlement: 'с. Намцы',
      status: 'pending',
      contact: state.profile.email ?? state.profile.phone,
      created_at: `${DEMO_TODAY}T09:41:00+09:00`,
    };
    update(() => {
      state.joinRequest = request;
      state.joinChecks = 0;
    });
    return request;
  });
}

function useMyJoinRequestMock(): Query<JoinRequest | null> {
  const base = useQuery('join-request', () => state.joinRequest);
  const baseRefetch = base.refetch;
  // Демо: владелец подтверждает запрос со второй проверки статуса.
  const refetch = useCallback(async () => {
    state.joinChecks += 1;
    await baseRefetch();
    if (state.joinRequest?.status === 'pending' && state.joinChecks >= 2) {
      update(() => {
        if (state.joinRequest) state.joinRequest = { ...state.joinRequest, status: 'approved' };
        loadDemoWorkspace();
      });
    }
  }, [baseRefetch]);
  return { ...base, refetch };
}

// ─── v2: напоминания, push ──────────────────────────────────────────────────

function computeDeadlines(): DeadlineReminder[] {
  const key = (d: DeadlineReminder) => (d.days_left < 0 ? 1000 + Math.abs(d.days_left) : d.days_left);
  return computeObligations(2026)
    .filter((o) => o.status !== 'submitted')
    .map<DeadlineReminder>((o) => ({
      form_code: o.form_code,
      title: o.title.replace('Форма ', ''),
      due_on: o.due_on,
      days_left: daysBetween(DEMO_TODAY, o.due_on),
      status: o.status,
    }))
    .sort((a, b) => key(a) - key(b));
}

function useUpcomingDeadlinesMock(): Query<DeadlineReminder[]> {
  return useQuery('deadlines', computeDeadlines);
}

function useReminderSettingsMock(): Query<ReminderSettings & Pick<UserSettings, 'push_enabled' | 'sound'>> {
  return useQuery('reminders', () => ({ ...state.reminders, push_enabled: state.settings.push_enabled, sound: state.settings.sound }));
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function useUpdateReminderSettingsMock(): Mutation<ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>, void> {
  return useMutation((input: ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>) => {
    update(() => {
      const { push_enabled, sound, ...rest } = input;
      const reminders = { ...state.reminders, ...stripUndefined(rest) };
      state.reminders = reminders;
      state.settings = {
        ...state.settings,
        ...(push_enabled !== undefined ? { push_enabled } : null),
        ...(sound !== undefined ? { sound } : null),
        deadline_reminders: reminders.remind_7_days || reminders.remind_1_day,
      };
    });
  });
}

async function registerPushTokenMock(token: string): Promise<void> {
  await wait(100);
  state.pushToken = token;
}

// ─── v2: чат-помощник (J1–J7) ───────────────────────────────────────────────

const CHAT_SUGGESTIONS = ['Какие отчеты скоро сдавать?', 'Как проверить отчет?', 'Записать надой'];
const CHAT_FALLBACK =
  'Я помогаю с учетом и отчетами. Скажите или напишите, например: «Сегодня коровы дали 120 литров молока» или «Какие отчеты скоро сдавать?».';

const HOW_TO_CARD: ChatCard = {
  kind: 'how_to',
  title: 'Как подготовить отчет',
  steps: ['Откройте черновик отчета.', 'Проверьте период, цифры и получателя.', 'Подтвердите отправку в самом отчете.'],
};

let chatSeq = 0;

function chatId(): Uuid {
  chatSeq += 1;
  return `msg-${String(chatSeq).padStart(3, '0')}`;
}

function chatTime(offset = 0): IsoDateTime {
  const minutes = 9 * 60 + 41 + state.chat.messages.length + offset;
  return `${DEMO_TODAY}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+09:00`;
}

function deadlineCards(): ChatCard[] {
  return computeDeadlines().map((reminder) => ({ kind: 'deadline', reminder }));
}

function greetingMessage(): ChatMessage {
  const name = state.profile.full_name?.trim();
  return {
    id: chatId(),
    role: 'assistant',
    text: `Здравствуйте${name ? `, ${name}` : ''}!\nСкажите: «Сегодня коровы дали 120 литров молока». Я запишу надой в журнал.`,
    created_at: `${DEMO_TODAY}T09:41:00+09:00`,
    cards: deadlineCards(),
  };
}

function resetChatState(): void {
  state.chat = { messages: [greetingMessage()], sending: false, error: null, awaiting: null };
}

function parseLiters(text: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)/.exec(text.replace(/(\d)\s(?=\d{3}\b)/g, '$1'));
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 && value <= 5000 ? value : null;
}

interface AssistantReply {
  text: string;
  cards?: ChatCard[];
  awaiting?: 'milk' | null;
}

function saveMilk(liters: number): AssistantReply {
  const entry: ProductOutputEvent = {
    id: nextEventId(),
    farm_id: state.farm.id,
    type: 'product_output',
    occurred_on: DEMO_TODAY,
    note: 'Записано помощником',
    created_at: chatTime(1),
    pending_sync: false,
    product: 'milk',
    quantity: litersToKg(liters),
    source_group: 'cattle_cows',
  };
  state.events = [...state.events, entry];
  return {
    text: `Сохранил надой: ${fmtNum(liters)} л за ${fmtDateLong(DEMO_TODAY).replace(/ \d{4}$/, '')}`,
    cards: [
      {
        kind: 'saved_event',
        entry_id: entry.id,
        rows: [
          { label: 'Тип', value: 'Надой' },
          { label: 'Животные', value: 'Коровы' },
          { label: 'Количество', value: `${fmtNum(liters)} л` },
          { label: 'Дата', value: fmtDate(DEMO_TODAY) },
          { label: 'Журнал', value: 'Журнал учета' },
        ],
      },
    ],
    awaiting: null,
  };
}

function assistantReply(text: string, awaiting: 'milk' | null): AssistantReply {
  const lower = text.toLowerCase();
  const liters = parseLiters(text);
  const milkWords = /надо|молок|удо[йя]|подо[ие]/.test(lower);
  if ((awaiting === 'milk' || milkWords) && liters !== null) return saveMilk(liters);
  if (milkWords) {
    return {
      text: 'Сколько литров молока получили сегодня?\nПока ничего не сохранил. Напишите количество — и я запишу надой в журнал.',
      awaiting: 'milk',
    };
  }
  if (/как (проверить|подготовить|сдать)/.test(lower)) {
    return { text: 'Отчет отправляется только после вашей проверки. Порядок такой:', cards: [HOW_TO_CARD], awaiting: null };
  }
  if (/отчет|сдава|срок|исо|табун/.test(lower)) {
    const cards = deadlineCards();
    if (cards.length === 0) return { text: 'Ближайших сроков по отчетам нет.', awaiting: null };
    return { text: 'По вашим отчетам — один ближайший срок и один уже истекший:', cards: [...cards, HOW_TO_CARD], awaiting: null };
  }
  return { text: CHAT_FALLBACK, awaiting };
}

function setChat(patch: Partial<ChatState>): void {
  update(() => {
    state.chat = { ...state.chat, ...patch };
  });
}

async function chatSend(text: string, fromVoice = false): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || state.chat.sending) return;
  const offline = flagsTarget.offline === true;
  const userMessage: ChatMessage = {
    id: chatId(),
    role: 'user',
    text: trimmed,
    created_at: chatTime(),
    status: offline ? 'failed' : 'sent',
    ...(fromVoice ? { from_voice: true } : null),
  };
  if (offline) {
    setChat({ messages: [...state.chat.messages, userMessage], error: 'Нет связи. Сообщение не отправлено — повторите, когда появится интернет.' });
    return;
  }
  setChat({ messages: [...state.chat.messages, userMessage], sending: true, error: null });
  await wait(700);
  let reply: AssistantReply = { text: CHAT_FALLBACK };
  update(() => {
    reply = assistantReply(trimmed, state.chat.awaiting);
  });
  const assistant: ChatMessage = {
    id: chatId(),
    role: 'assistant',
    text: reply.text,
    created_at: chatTime(),
    ...(reply.cards ? { cards: reply.cards } : null),
  };
  setChat({ messages: [...state.chat.messages, assistant], sending: false, awaiting: reply.awaiting ?? null });
}

async function chatSendVoice(clip: VoiceClip): Promise<void> {
  if (state.chat.sending) return;
  if (flagsTarget.offline) {
    setChat({
      messages: [
        ...state.chat.messages,
        { id: chatId(), role: 'user', text: 'Голосовое сообщение', created_at: chatTime(), status: 'failed', from_voice: true },
      ],
      error: 'Нет связи. Голосовое сообщение не отправлено — запишите еще раз, когда появится интернет, или напишите текстом.',
    });
    return;
  }
  setChat({ sending: true, error: null });
  await wait(900);
  setChat({ sending: false });
  if (clip.durationMs < 800) {
    setChat({ error: 'Не удалось расслышать запись. Попробуйте еще раз или напишите текстом.' });
    return;
  }
  // Демо-распознавание: запись превращается в типовую фразу про надой.
  await chatSend('Сегодня коровы дали 120 литров молока', true);
}

async function chatUndo(entryId: Uuid): Promise<void> {
  await wait(DELAY_MS);
  update(() => {
    state.events = state.events.filter((e) => e.id !== entryId);
    const cleaned = state.chat.messages.map((m) =>
      m.cards ? { ...m, cards: m.cards.filter((c) => !(c.kind === 'saved_event' && c.entry_id === entryId)) } : m,
    );
    state.chat = {
      ...state.chat,
      messages: [...cleaned, { id: chatId(), role: 'assistant', text: 'Запись отменена. Надой удален из журнала.', created_at: chatTime() }],
    };
  });
}

function chatReset(): void {
  update(resetChatState);
}

function useAssistantChatMock(): AssistantChat {
  const chat = useStore(() => state.chat);
  const offline = useStore(() => flagsTarget.offline === true);
  return {
    messages: chat.messages,
    suggestions: CHAT_SUGGESTIONS,
    sending: chat.sending,
    error: chat.error,
    available: !offline,
    send: chatSend,
    sendVoice: chatSendVoice,
    undoEvent: chatUndo,
    reset: chatReset,
  };
}

resetChatState();

// ─── Экспорт по контракту DataModule ────────────────────────────────────────

export { DataProvider };
export const useAuth = useAuthMock;
export const useSyncStatus = useSyncStatusMock;
export const useFarm = useFarmMock;
export const useUpdateFarm = useUpdateFarmMock;
export const useUpdateProfile = useUpdateProfileMock;
export const useDashboard = useDashboardMock;
export const useJournal = useJournalMock;
export const useJournalEntry = useJournalEntryMock;
export const useCreateEvent = useCreateEventMock;
export const useUpdateEvent = useUpdateEventMock;
export const useDeleteEvent = useDeleteEventMock;
export const getEventDestinations: DataModule['getEventDestinations'] = (input) => computeDestinations(input);
export const useHerd = useHerdMock;
export const useHorseHerd = useHorseHerdMock;
export const useReports = useReportsMock;
export const useReportPreview = useReportPreviewMock;
export const useSubmitReport = useSubmitReportMock;
export const getReportDownloadUrl = getReportDownloadUrlMock;
export const getReceiptUrl = getReceiptUrlMock;
export const useHousehold = useHouseholdMock;
export const useAddHouseholdMember = useAddHouseholdMemberMock;
export const useHouseholdExtract = useHouseholdExtractMock;
export const useMercury = useMercuryMock;
export const useMercuryDocument = useMercuryDocumentMock;
export const useMercuryConnect = useMercuryConnectMock;
export const useMercuryRefresh = useMercuryRefreshMock;
export const useNotifications = useNotificationsMock;
export const useMarkNotificationsRead = useMarkNotificationsReadMock;
export const useSettings = useSettingsMock;
export const useUpdateSettings = useUpdateSettingsMock;
export const useFaq = useFaqMock;
export const useCreateSupportTicket = useCreateSupportTicketMock;
export const signIn: DataModule['signIn'] = signInMock;
export const signUp: DataModule['signUp'] = signUpMock;
export const verifySignUpCode: DataModule['verifySignUpCode'] = verifySignUpCodeMock;
export const resendCode: DataModule['resendCode'] = resendCodeMock;
export const useOnboardingStep = useOnboardingStepMock;
export const useCreateFarm = useCreateFarmMock;
export const useFindFarm = useFindFarmMock;
export const useRequestAccess = useRequestAccessMock;
export const useMyJoinRequest = useMyJoinRequestMock;
export const useAssistantChat = useAssistantChatMock;
export const useUpcomingDeadlines = useUpcomingDeadlinesMock;
export const useReminderSettings = useReminderSettingsMock;
export const useUpdateReminderSettings = useUpdateReminderSettingsMock;
export const registerPushToken: DataModule['registerPushToken'] = async (token) => registerPushTokenMock(token);

/** Для отладки и скриншотов: сброс флагов состояний. */
export function setMockFlags(flags: MockFlags): void {
  (globalThis as { __AGRO_MOCK__?: MockFlags }).__AGRO_MOCK__ = flags;
}
