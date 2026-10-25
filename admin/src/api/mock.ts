// Заглушки API для визуальной проверки без сети и без миграции базы (npm run dev:mock, VITE_MOCK=1).
// Данные правдоподобны и построены по контракту docs/TZ-admin.md §2. Файл подключается динамически и в обычную сборку не попадает.
import { ApiError } from './errors';
import type {
  AdminApi,
  AdminAuditEntry,
  AdminBroadcast,
  AdminFarm,
  AdminFarmDetail,
  AdminFarmJoinRequest,
  AdminFarmMember,
  AdminFarmSubmission,
  AdminStats,
  AdminSubmission,
  AdminTicket,
  AdminUser,
  AdminUserDetail,
  AssistantModelOption,
  AssistantModelSettings,
  BroadcastInput,
  BroadcastResult,
  DeadlinePatch,
  LegalStatus,
  Paged,
  ReportDeadline,
  SessionInfo,
  TicketStatus,
  UserRole,
} from './types';
import { validateCredentials } from '../lib/login';

// ─── Детерминированный генератор ────────────────────────────────────────────

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20261025);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const uuid = (kind: number, n: number) => `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number, extraHours = 0) => new Date(NOW - days * DAY - extraHours * 3_600_000).toISOString();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const latency = () => delay(180 + Math.floor(rand() * 220));

// ─── Справочники ────────────────────────────────────────────────────────────

const SURNAMES = ['Иванов', 'Петров', 'Слепцов', 'Охлопков', 'Максимов', 'Попов', 'Егоров', 'Васильев', 'Николаев', 'Борисов', 'Дьячковский', 'Захаров', 'Ефимов', 'Софронов', 'Готовцев'];
const SURNAMES_F = ['Иванова', 'Петрова', 'Слепцова', 'Охлопкова', 'Максимова', 'Попова', 'Егорова', 'Васильева', 'Николаева', 'Борисова', 'Дьячковская', 'Захарова', 'Ефимова', 'Софронова', 'Готовцева'];
const NAMES_M = ['Иван Петрович', 'Айаал Николаевич', 'Дмитрий Егорович', 'Михаил Семёнович', 'Сергей Афанасьевич', 'Николай Гаврильевич', 'Степан Прокопьевич'];
const NAMES_F = ['Мария Ивановна', 'Айыына Петровна', 'Сардаана Васильевна', 'Наталья Егоровна', 'Туяара Михайловна', 'Ольга Николаевна'];
const SETTLEMENTS = ['с. Намцы', 'с. Бярийэ', 'с. Кысыл-Сыр', 'с. Хатассы', 'с. Майя', 'с. Аллагой', 'с. Сатагай', 'с. Чурапча'];
const REGION = 'Республика Саха (Якутия)';

const DEADLINES: ReportDeadline[] = [
  { form_code: '3-fermer', title: 'Форма 3-фермер', description: 'Производство продукции животноводства и поголовье скота', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '3Ф', period_kind: 'year', period_shift_months: 0, due_month_offset: 0, due_year_offset: 1, due_month: 1, due_day: 10, has_official_blank: true, comment: 'Бланк Росстата: с 4 по 10 января после отчётного периода' },
  { form_code: '3-fermer-month', title: 'Форма 3-фермер (рег)', description: 'Производство продукции · региональная', authority: 'sakhastat', recipient: 'Сахастат', scope: 'regional', receipt_code: 'ЗФР', period_kind: 'month', period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: null, due_day: 20, has_official_blank: true, comment: 'Ежемесячная версия; срок демонстрационный' },
  { form_code: '1-fermer', title: 'Форма 1-фермер', description: 'Сведения об итогах сева под урожай', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '1Ф', period_kind: 'year', period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: 6, due_day: 15, has_official_blank: true, comment: 'Бланк Росстата: с 30 апреля по 15 июня' },
  { form_code: '2-fermer', title: 'Форма 2-фермер', description: 'Сведения о сборе урожая сельскохозяйственных культур', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '2Ф', period_kind: 'year', period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: 11, due_day: 21, has_official_blank: true, comment: 'Бланк Росстата: с 13 октября по 21 ноября' },
  { form_code: '1-kfh', title: 'Форма 1-КФХ', description: 'Информация о производственной деятельности глав КФХ', authority: 'minselhoz', recipient: 'Минсельхоз России', scope: 'federal', receipt_code: '1КФХ', period_kind: 'year', period_shift_months: 0, due_month_offset: 0, due_year_offset: 1, due_month: 2, due_day: 25, has_official_blank: true, comment: 'Срок не прочитан в скане приказа Минсельхоза № 165 — демонстрационный' },
  { form_code: '1-ip', title: 'Форма 1-ИП', description: 'Сведения о деятельности хозяйства', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '1ИП', period_kind: 'any', period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: 2, due_day: 15, has_official_blank: true, comment: 'Для ЛПХ — ежемесячное демо-превью; для ИП — годовая форма Минсельхоза' },
  { form_code: '1-tabun', title: 'Форма 1-ТАБУН', description: 'Табунное коневодство', authority: 'sakhastat', recipient: 'Сахастат', scope: 'regional', receipt_code: 'ТАБУН', period_kind: 'month', period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: null, due_day: 20, has_official_blank: false, comment: 'Республиканская форма Сахастата, бланка нет — только превью' },
  { form_code: '10-sh', title: 'Форма 10-СХ', description: 'Сведения о заготовке кормов', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '10СХ', period_kind: 'month', period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: null, due_day: 15, has_official_blank: false, comment: 'Бланка нет — только превью' },
  { form_code: '1-iso-r', title: 'Форма 1-ИСО-р', description: 'Сведения о поголовье животных', authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: 'ИСО', period_kind: 'month', period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: null, due_day: 30, has_official_blank: false, comment: 'Бланка нет — только превью' },
];

// ─── Состояние (в памяти вкладки) ───────────────────────────────────────────

const ADMIN_ID = uuid(1, 1);
const ADMIN_EMAIL = 'kuyaar52ngg@gmail.com';
const REGULAR_ID = uuid(1, 2);

interface UserRow extends Omit<AdminUser, 'farms_count'> {
  farmIds: string[];
}

interface FarmRow extends Omit<AdminFarm, 'owner' | 'members_count' | 'reports_submitted'> {
  ownerId: string;
  memberIds: string[];
  address: string;
  ogrn: string;
  oktmo: string;
  book_record_no: string | null;
  invite_code: string;
  joinRequests: AdminFarmJoinRequest[];
}

const users: UserRow[] = [];
const farms: FarmRow[] = [];
const submissions: AdminSubmission[] = [];
const tickets: AdminTicket[] = [];
const broadcasts: AdminBroadcast[] = [];
const audit: AdminAuditEntry[] = [];
const deadlines: ReportDeadline[] = DEADLINES.map((d) => ({ ...d }));
const settings: AssistantModelSettings = {
  model: 'anthropic/claude-haiku-5.5',
  fallback_models: ['google/gemini-3-flash:free'],
  updated_at: ago(3, 2),
  updated_by: ADMIN_EMAIL,
};

function seed(): void {
  // Пользователи: 0 — администратор, 1 — обычный пользователь (вход «denied»).
  const total = 48;
  for (let i = 0; i < total; i++) {
    const female = i % 3 === 1;
    const si = i % SURNAMES.length;
    const surname = (female ? SURNAMES_F : SURNAMES)[si] as string;
    const name = pick(female ? NAMES_F : NAMES_M);
    const role: UserRole = i % 11 === 6 ? 'council_specialist' : i % 3 === 0 ? 'farm_head' : 'lph_owner';
    const isAdminUser = i === 0 || i === 7;
    users.push({
      id: i === 0 ? ADMIN_ID : i === 1 ? REGULAR_ID : uuid(1, i + 1),
      full_name: i === 0 ? 'Куяар Администратор' : `${surname} ${name}`,
      email: i === 0 ? ADMIN_EMAIL : `${['ayaal', 'sardaana', 'nikolay', 'maria', 'ivan', 'tuyaara', 'stepan'][i % 7]}.${si}${i}@example.ru`,
      phone: `+7 914 ${between(100, 999)}-${between(10, 99)}-${between(10, 99)}`,
      role: i === 0 ? 'farm_head' : role,
      settlement: pick(SETTLEMENTS),
      created_at: ago(between(2, 200)),
      last_sign_in_at: i % 9 === 4 ? null : ago(between(0, 40), between(0, 20)),
      banned_until: i === 5 || i === 17 ? new Date(NOW + 876000 * 3_600_000).toISOString() : i === 29 ? new Date(NOW + 9 * DAY).toISOString() : null,
      is_admin: isAdminUser,
      farmIds: [],
    });
  }

  // Хозяйства
  const statuses: LegalStatus[] = ['lph', 'lph', 'kfh', 'ip', 'lph', 'kfh'];
  const farmNames: Record<LegalStatus, string[]> = {
    lph: ['ЛПХ Ивановых', 'ЛПХ Слепцовых', 'ЛПХ Охлопковых', 'ЛПХ Максимовых', 'ЛПХ Поповых', 'ЛПХ Егоровых', 'ЛПХ Николаевых', 'ЛПХ Борисовых'],
    kfh: ['КФХ «Тыгын»', 'КФХ «Эрэл»', 'КФХ «Сайдыы»', 'КФХ «Ньургун»', 'КФХ «Кыталык»', 'КФХ «Дьулуур»'],
    ip: ['ИП Васильев А. Н.', 'ИП Захарова Т. М.', 'ИП Ефимов С. П.', 'ИП Софронов Д. Е.'],
  };
  const used: Record<LegalStatus, number> = { lph: 0, kfh: 0, ip: 0 };
  const farmCount = 30;
  for (let i = 0; i < farmCount; i++) {
    const status = statuses[i % statuses.length] as LegalStatus;
    const names = farmNames[status];
    const baseName = names[used[status] % names.length] as string;
    const name = used[status] >= names.length ? `${baseName} (${Math.floor(used[status] / names.length) + 1})` : baseName;
    used[status] += 1;
    const owner = users[i + 2] as UserRow;
    const id = uuid(2, i + 1);
    const settlement = pick(SETTLEMENTS);
    const members = [owner.id];
    const extra = between(0, 3);
    for (let k = 0; k < extra; k++) {
      const candidate = users[(i * 3 + k + 30) % users.length] as UserRow;
      if (!members.includes(candidate.id) && candidate.id !== ADMIN_ID) members.push(candidate.id);
    }
    for (const m of members) (users.find((u) => u.id === m) as UserRow).farmIds.push(id);
    const pendingUser = users[(i * 5 + 11) % users.length] as UserRow;
    farms.push({
      id,
      name,
      inn: `14${String(between(1000000000, 9999999999))}`,
      legal_status: status,
      region: REGION,
      settlement,
      created_at: ago(between(10, 220)),
      last_activity_at: i % 8 === 5 ? null : ago(between(0, 25), between(0, 20)),
      mercury_status: i % 3 === 0 ? 'connected_demo' : 'not_connected',
      horriot_status: i % 4 === 0 ? 'connected_demo' : 'not_connected',
      ownerId: owner.id,
      memberIds: members,
      address: `${settlement}, ул. ${pick(['Луговая', 'Центральная', 'Молодёжная', 'Советская', 'Набережная'])}, ${between(1, 60)}`,
      ogrn: status === 'lph' ? '' : String(between(1000000000000, 9999999999999)),
      oktmo: `9864${between(1000, 9999)}`,
      book_record_no: status === 'lph' ? `№ ${String(between(100, 999)).padStart(4, '0')}` : null,
      invite_code: Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[between(0, 31)]).join(''),
      joinRequests:
        i % 4 === 2
          ? [
              { id: uuid(3, i + 1), user_id: pendingUser.id, full_name: pendingUser.full_name, status: 'pending', created_at: ago(between(0, 4)) },
              { id: uuid(3, i + 100), user_id: (users[(i + 3) % users.length] as UserRow).id, full_name: (users[(i + 3) % users.length] as UserRow).full_name, status: 'approved', created_at: ago(between(6, 30)) },
            ]
          : [],
    });
  }

  // Сданные отчёты
  let sn = 0;
  const codes = deadlines.map((d) => d.form_code);
  for (const farm of farms) {
    const count = between(0, 6);
    for (let k = 0; k < count; k++) {
      const form = pick(codes);
      const def = deadlines.find((d) => d.form_code === form) as ReportDeadline;
      const monthly = def.period_kind === 'month' || (def.period_kind === 'any' && k % 2 === 0);
      const year = k % 3 === 0 ? 2025 : 2026;
      const month = monthly ? between(1, year === 2026 ? 9 : 12) : null;
      const status = k === 4 ? 'draft' : k === 5 ? 'failed' : 'submitted';
      sn += 1;
      submissions.push({
        id: uuid(4, sn),
        farm_id: farm.id,
        farm_name: farm.name,
        inn: farm.inn,
        form_code: form,
        period_year: year,
        period_month: month,
        status,
        recipient: def.recipient,
        receipt_no: status === 'submitted' ? `УЧ-${def.receipt_code}-${year}-${String(sn).padStart(3, '0')}` : null,
        submitted_at: status === 'submitted' ? ago(between(0, 120), between(0, 20)) : null,
      });
    }
  }
  submissions.sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));

  // Обращения
  const topics: [string, string | null, string][] = [
    ['Не приходит код подтверждения', 'Вход', 'Запросил код на почту уже три раза, письмо не приходит. Проверил папку «Спам».'],
    ['Ошибка при отправке отчёта', 'Отчёты', 'При отправке формы 1-ТАБУН появляется «Не удалось отправить». Что делать?'],
    ['Как добавить члена семьи', 'Мое ЛПХ', 'Хочу добавить сына в состав хозяйства, не нахожу кнопку.'],
    ['Неверное поголовье в отчёте', 'Журнал', 'В превью 1-ИСО-р 24 овцы, а в журнале 26. Откуда расхождение?'],
    ['Не подключается Меркурий', 'Меркурий', 'Нажимаю «Подключить» — крутится и пишет об ошибке.'],
    ['Вопрос по срокам сдачи', 'Отчёты', 'До какого числа нужно сдать 3-фермер за 2025 год?'],
    ['Сменить номер телефона', 'Профиль', 'Старый номер потерян, как привязать новый?'],
    ['Помощник не отвечает', 'Помощник', 'Задаю вопрос про надои, ответа нет уже минуту.'],
  ];
  const statusCycle: TicketStatus[] = ['new', 'new', 'in_progress', 'answered', 'closed', 'new', 'answered', 'in_progress'];
  for (let i = 0; i < 18; i++) {
    const farm = farms[(i * 3) % farms.length] as FarmRow;
    const owner = users.find((u) => u.id === farm.ownerId) as UserRow;
    const [topic, section, message] = topics[i % topics.length] as [string, string | null, string];
    const status = statusCycle[i % statusCycle.length] as TicketStatus;
    const replied = status === 'answered' || status === 'closed';
    tickets.push({
      id: uuid(5, i + 1),
      number: `AGRO-2026-${String(142 + i).padStart(4, '0')}`,
      topic,
      related_section: section,
      message,
      status,
      admin_reply: replied ? 'Здравствуйте! Мы проверили: проблема исправлена, обновите приложение и повторите действие.' : null,
      replied_at: replied ? ago(between(0, 5), between(0, 20)) : null,
      created_at: ago(between(0, 20), between(0, 20)),
      farm_id: farm.id,
      farm_name: farm.name,
      user_full_name: owner.full_name,
      user_email: owner.email,
    });
  }
  tickets.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Рассылки
  const bc: [string, string, unknown, number, number][] = [
    ['Плановые работы 28 октября', 'С 02:00 до 04:00 по якутскому времени приложение может быть недоступно.', { target: 'all' }, 30, 22],
    ['Напоминание: сдайте 1-ТАБУН', 'До 20 числа нужно отправить форму 1-ТАБУН за текущий месяц.', { target: 'status', status: 'kfh' }, 10, 8],
    ['Новая функция: Хорриот', 'В разделе «Мое хозяйство» появилась сверка с Хорриотом.', { target: 'all' }, 30, 25],
    ['Приглашение на вебинар', 'В четверг в 15:00 расскажем, как вести журнал поголовья.', { target: 'farms', farm_ids: [farms[0]?.id, farms[1]?.id, farms[2]?.id] }, 3, 3],
  ];
  bc.forEach(([title, body, target, farmsCount, push], i) => {
    broadcasts.push({ id: uuid(6, i + 1), title, body, target, farms_count: farmsCount, push_sent: push, created_by: ADMIN_ID, created_by_email: ADMIN_EMAIL, created_at: ago(2 + i * 5, 3) });
  });

  // Журнал действий
  const entries: [string, string, string, unknown, number][] = [
    ['broadcast.send', 'broadcast', broadcasts[0]?.id ?? '', { title: 'Плановые работы 28 октября', farms_count: 30 }, 2],
    ['ticket.reply', 'ticket', tickets[3]?.id ?? '', { number: tickets[3]?.number, status: 'answered' }, 4],
    ['deadline.update', 'deadline', '1-tabun', { due_day: { from: 15, to: 20 } }, 6],
    ['user.block', 'user', users[5]?.id ?? '', { reason: 'Подозрение на взлом учётной записи' }, 9],
    ['user.grant_admin', 'user', users[7]?.id ?? '', {}, 14],
    ['user.unblock', 'user', users[12]?.id ?? '', {}, 16],
    ['user.revoke_admin', 'user', users[9]?.id ?? '', {}, 20],
  ];
  for (let i = 0; i < 24; i++) {
    const [action, type, target, details, days] = entries[i % entries.length] as [string, string, string, unknown, number];
    audit.push({
      id: uuid(7, i + 1),
      admin_id: i % 5 === 4 ? (users[7] as UserRow).id : ADMIN_ID,
      admin_email: i % 5 === 4 ? (users[7] as UserRow).email : ADMIN_EMAIL,
      action,
      target_type: type,
      target_id: target,
      details,
      created_at: ago(days + Math.floor(i / entries.length) * 4, i),
    });
  }
  audit.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
seed();

const MODEL_NAMES: [string, string, boolean, number][] = [
  ['anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5', false, 200000],
  ['anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5', false, 1000000],
  ['openai/gpt-5-mini', 'OpenAI: GPT-5 Mini', false, 400000],
  ['openai/gpt-5', 'OpenAI: GPT-5', false, 400000],
  ['google/gemini-3-flash', 'Google: Gemini 3 Flash', false, 1048576],
  ['google/gemini-3-flash:free', 'Google: Gemini 3 Flash (free)', true, 1048576],
  ['meta-llama/llama-4-scout:free', 'Meta: Llama 4 Scout (free)', true, 128000],
  ['mistralai/mistral-medium-4', 'Mistral: Medium 4', false, 131072],
  ['qwen/qwen3-235b-a22b:free', 'Qwen: Qwen3 235B A22B (free)', true, 131072],
  ['deepseek/deepseek-v4-chat', 'DeepSeek: V4 Chat', false, 163840],
  ['deepseek/deepseek-v4-chat:free', 'DeepSeek: V4 Chat (free)', true, 163840],
  ['x-ai/grok-5-fast', 'xAI: Grok 5 Fast', false, 2000000],
];
const modelOptions: AssistantModelOption[] = MODEL_NAMES.map(([id, name, free, ctx]) => ({ id, name, free, context_length: ctx }));
for (let i = 0; i < 28; i++) {
  const vendor = pick(['cohere', 'nvidia', 'microsoft', 'amazon', 'perplexity', 'z-ai', 'moonshotai']);
  const free = i % 4 === 0;
  modelOptions.push({
    id: `${vendor}/model-${i + 1}${free ? ':free' : ''}`,
    name: `${vendor.charAt(0).toUpperCase()}${vendor.slice(1)}: Model ${i + 1}${free ? ' (free)' : ''}`,
    free,
    context_length: i % 9 === 8 ? null : ([32768, 65536, 131072, 262144][i % 4] ?? 32768),
  });
}

// ─── Вспомогательное ────────────────────────────────────────────────────────

function page<T>(items: T[], limit: number, offset: number): Paged<T> {
  return { total: items.length, items: items.slice(offset, offset + limit) };
}

const has = (value: string | null | undefined, q: string) => !!value && value.toLowerCase().includes(q);

function userView(u: UserRow): AdminUser {
  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    settlement: u.settlement,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    banned_until: u.banned_until,
    is_admin: u.is_admin,
    farms_count: u.farmIds.length,
  };
}

function ownerOf(f: FarmRow): AdminFarm['owner'] {
  const o = users.find((u) => u.id === f.ownerId);
  return o ? { id: o.id, full_name: o.full_name, email: o.email } : null;
}

function farmView(f: FarmRow): AdminFarm {
  return {
    id: f.id,
    name: f.name,
    inn: f.inn,
    legal_status: f.legal_status,
    region: f.region,
    settlement: f.settlement,
    owner: ownerOf(f),
    members_count: f.memberIds.length,
    created_at: f.created_at,
    last_activity_at: f.last_activity_at,
    mercury_status: f.mercury_status,
    horriot_status: f.horriot_status,
    reports_submitted: submissions.filter((s) => s.farm_id === f.id && s.status === 'submitted').length,
  };
}

function writeAudit(action: string, type: string, target: string, details: unknown): void {
  audit.unshift({ id: crypto.randomUUID(), admin_id: ADMIN_ID, admin_email: ADMIN_EMAIL, action, target_type: type, target_id: target, details, created_at: new Date().toISOString() });
}

function currentUserId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

const SESSION_KEY = 'agro-okno-admin-mock-session';
const listeners = new Set<(s: SessionInfo | null) => void>();
const notify = () => {
  const id = currentUserId();
  const s = id ? { userId: id, email: id === ADMIN_ID ? ADMIN_EMAIL : 'user@example.ru' } : null;
  listeners.forEach((cb) => cb(s));
};

// Имитация «просыпающегося» Render-сервера: с ?cold в адресе серверные запросы отвечают не раньше чем через 7 секунд
// после загрузки страницы (отсчёт по времени, а не по числу вызовов — в dev StrictMode вызывает эффекты дважды).
const COLD_UNTIL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('cold') ? Date.now() + 7000 : 0;
async function serverLatency(ms = 350): Promise<void> {
  await delay(Math.max(ms, COLD_UNTIL - Date.now()));
}

function dailyValue(date: string, kind: 'events' | 'users'): number {
  const seedNum = Number(date.replaceAll('-', '')) % 9973;
  const r = rng(seedNum + (kind === 'events' ? 1 : 7))();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  return kind === 'events' ? Math.round((weekend ? 18 : 46) + r * 38) : Math.round(r * (weekend ? 0.8 : 1.6));
}

export const mockApi: AdminApi = {
  mock: true,

  auth: {
    async getSession() {
      await delay(120);
      const id = currentUserId();
      return id ? { userId: id, email: id === ADMIN_ID ? ADMIN_EMAIL : 'user@example.ru' } : null;
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signIn(identifier, password) {
      await delay(450);
      const problem = validateCredentials(identifier, password);
      if (problem) return { ok: false, message: problem };
      if (password === 'wrong') return { ok: false, message: 'Неверный логин или пароль' };
      try {
        sessionStorage.setItem(SESSION_KEY, identifier.trim().toLowerCase() === 'denied' ? REGULAR_ID : ADMIN_ID);
      } catch {
        // sessionStorage недоступен — вход не сохранится после перезагрузки
      }
      notify();
      return { ok: true };
    },
    async signOut() {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // ничего
      }
      notify();
    },
    async isAdmin() {
      await delay(200);
      return currentUserId() === ADMIN_ID;
    },
    async profile(userId) {
      return userId === ADMIN_ID ? { full_name: 'Куяар Администратор', email: ADMIN_EMAIL } : { full_name: 'Обычный пользователь', email: 'user@example.ru' };
    },
  },

  async stats(from, to): Promise<AdminStats> {
    await latency();
    const daily: AdminStats['daily'] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
      const date = new Date(t).toISOString().slice(0, 10);
      daily.push({ date, events: dailyValue(date, 'events'), new_users: dailyValue(date, 'users') });
    }
    const byStatus = { kfh: 0, ip: 0, lph: 0 };
    farms.forEach((f) => (byStatus[f.legal_status] += 1));
    // справочник целиком, включая формы без сданных отчётов (нули)
    const reports = new Map<string, number>(deadlines.map((d) => [d.form_code, 0]));
    submissions.filter((s) => s.status === 'submitted').forEach((s) => reports.set(s.form_code, (reports.get(s.form_code) ?? 0) + 1));
    return {
      users_total: users.length,
      users_new: Math.min(users.length, daily.reduce((a, d) => a + d.new_users, 0)),
      farms_total: farms.length,
      farms_by_status: byStatus,
      events_count: daily.reduce((a, d) => a + d.events, 0),
      reports_by_form: [...reports.entries()].map(([form_code, count]) => ({ form_code, count })).sort((a, b) => b.count - a.count),
      mercury_connected: farms.filter((f) => f.mercury_status === 'connected_demo').length,
      horriot_connected: farms.filter((f) => f.horriot_status === 'connected_demo').length,
      assistant_messages: daily.length * 23 + 41,
      open_tickets: tickets.filter((t) => t.status === 'new' || t.status === 'in_progress').length,
      daily,
    };
  },

  async listUsers({ search, limit, offset }) {
    await latency();
    const q = search.trim().toLowerCase();
    const found = users.filter((u) => {
      if (!q) return true;
      if (has(u.full_name, q) || has(u.email, q) || has(u.phone, q)) return true;
      return u.farmIds.some((id) => has(farms.find((f) => f.id === id)?.inn, q));
    });
    return page(found.map(userView), limit, offset);
  },

  async getUser(id): Promise<AdminUserDetail> {
    await latency();
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'Пользователь не найден', 404);
    const myFarms = u.farmIds.map((fid) => farms.find((f) => f.id === fid) as FarmRow);
    const myTickets = tickets.filter((t) => myFarms.some((f) => f.id === t.farm_id)).slice(0, 5);
    return {
      ...userView(u),
      farms: myFarms.map((f) => ({ id: f.id, name: f.name, inn: f.inn, legal_status: f.legal_status, member_role: f.ownerId === u.id ? 'owner' : 'member' })),
      tickets: myTickets.map((t) => ({ id: t.id, number: t.number, topic: t.topic, status: t.status, created_at: t.created_at })),
      events_30d: between(0, 140),
    };
  },

  async setAdmin(id, grant) {
    await latency();
    if (!grant && id === currentUserId()) throw new ApiError('validation', 'Нельзя снять права администратора с себя', 400, '22023');
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'Пользователь не найден', 404);
    u.is_admin = grant;
    writeAudit(grant ? 'user.grant_admin' : 'user.revoke_admin', 'user', id, {});
    return userView(u);
  },

  async blockUser(id, reason) {
    await serverLatency();
    if (id === currentUserId()) throw new ApiError('validation', 'Нельзя заблокировать самого себя', 400, 'self_block');
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'Пользователь не найден', 404);
    u.banned_until = new Date(NOW + 876000 * 3_600_000).toISOString();
    writeAudit('user.block', 'user', id, reason ? { reason } : {});
    return { user_id: id, blocked: true, banned_until: u.banned_until };
  },

  async unblockUser(id) {
    await serverLatency();
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError('not_found', 'Пользователь не найден', 404);
    u.banned_until = null;
    writeAudit('user.unblock', 'user', id, {});
    return { user_id: id, blocked: false, banned_until: null };
  },

  async listFarms({ search, status, limit, offset }) {
    await latency();
    const q = search.trim().toLowerCase();
    const found = farms.filter((f) => (!status || f.legal_status === status) && (!q || has(f.name, q) || has(f.inn, q) || has(f.settlement, q) || has(ownerOf(f)?.full_name, q)));
    return page(found.map(farmView), limit, offset);
  },

  async getFarm(id): Promise<AdminFarmDetail> {
    await latency();
    const f = farms.find((x) => x.id === id);
    if (!f) throw new ApiError('not_found', 'Хозяйство не найдено', 404);
    const members: AdminFarmMember[] = f.memberIds.map((uid) => {
      const u = users.find((x) => x.id === uid) as UserRow;
      return { user_id: u.id, full_name: u.full_name, email: u.email, role: u.id === f.ownerId ? 'owner' : 'member' };
    });
    const subs: AdminFarmSubmission[] = submissions
      .filter((s) => s.farm_id === id && s.status === 'submitted')
      .map((s) => ({ id: s.id, form_code: s.form_code, period_year: s.period_year, period_month: s.period_month, receipt_no: s.receipt_no, submitted_at: s.submitted_at }));
    return {
      ...farmView(f),
      address: f.address,
      ogrn: f.ogrn || null,
      oktmo: f.oktmo,
      book_record_no: f.book_record_no,
      invite_code: f.invite_code,
      members,
      join_requests: f.joinRequests,
      submissions: subs,
    };
  },

  async listSubmissions({ form, year, search, limit, offset }) {
    await latency();
    const q = search.trim().toLowerCase();
    const found = submissions.filter((s) => s.status === 'submitted' && (!form || s.form_code === form) && (!year || s.period_year === year) && (!q || has(s.farm_name, q) || has(s.inn, q)));
    return page(found, limit, offset);
  },

  async listDeadlines() {
    await latency();
    return deadlines.map((d) => ({ ...d }));
  },

  async updateDeadline(formCode, patch: DeadlinePatch) {
    await latency();
    const d = deadlines.find((x) => x.form_code === formCode);
    if (!d) throw new ApiError('not_found', 'Форма не найдена', 404);
    if (patch.due_day !== undefined && (patch.due_day < 1 || patch.due_day > 31)) throw new ApiError('validation', 'День срока должен быть от 1 до 31', 400, '22023');
    if (patch.due_month !== undefined && patch.due_month !== null && (patch.due_month < 1 || patch.due_month > 12)) throw new ApiError('validation', 'Месяц срока должен быть от 1 до 12', 400, '22023');
    if (patch.due_month === null && d.period_kind === 'year') throw new ApiError('validation', 'Для годовой формы нужно указать месяц срока', 400, '22023');
    if (patch.due_month_offset !== undefined && (patch.due_month_offset < 0 || patch.due_month_offset > 12)) throw new ApiError('validation', 'Смещение месяца должно быть от 0 до 12', 400, '22023');
    if (patch.due_year_offset !== undefined && (patch.due_year_offset < 0 || patch.due_year_offset > 3)) throw new ApiError('validation', 'Смещение года должно быть от 0 до 3', 400, '22023');
    Object.assign(d, patch);
    writeAudit('deadline.update', 'deadline', formCode, patch);
    return { ...d };
  },

  async listTickets({ status, search, limit, offset }) {
    await latency();
    const q = search.trim().toLowerCase();
    const found = tickets.filter((t) => (!status || t.status === status) && (!q || has(t.number, q) || has(t.topic, q) || has(t.farm_name, q) || has(t.user_full_name, q) || has(t.user_email, q)));
    return page(found, limit, offset);
  },

  async replyTicket(id, reply, status) {
    await latency();
    const t = tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('not_found', 'Обращение не найдено', 404);
    // reply = null оставляет прежний ответ; status = null при новом ответе ставит «Отвечено»
    const text = reply?.trim() ?? '';
    if (text !== '') {
      t.admin_reply = text;
      t.replied_at = new Date().toISOString();
      t.replied_by = ADMIN_ID;
      t.status = status ?? 'answered';
    } else if (status !== null) {
      t.status = status;
    }
    writeAudit('ticket.reply', 'ticket', id, { number: t.number, status: t.status });
    return { ...t };
  },

  async broadcast(input: BroadcastInput): Promise<BroadcastResult> {
    await serverLatency(700);
    const recipients = input.target === 'all' ? farms : input.target === 'status' ? farms.filter((f) => f.legal_status === input.status) : farms.filter((f) => input.farm_ids?.includes(f.id));
    if (recipients.length === 0) throw new ApiError('validation', 'Нет хозяйств для рассылки', 400);
    const push = Math.round(recipients.length * 0.8);
    const id = crypto.randomUUID();
    broadcasts.unshift({
      id,
      title: input.title,
      body: input.body,
      target: { target: input.target, status: input.status, farm_ids: input.farm_ids },
      farms_count: recipients.length,
      push_sent: push,
      created_by: ADMIN_ID,
      created_by_email: ADMIN_EMAIL,
      created_at: new Date().toISOString(),
    });
    writeAudit('broadcast.send', 'broadcast', id, { title: input.title, farms_count: recipients.length });
    return { broadcast_id: id, farms_count: recipients.length, push_sent: push };
  },

  async listBroadcasts({ limit, offset }) {
    await latency();
    return page(broadcasts, limit, offset);
  },

  async listAudit({ action, limit, offset }) {
    await latency();
    return page(audit.filter((a) => !action || a.action === action), limit, offset);
  },

  async assistantSettings() {
    await serverLatency();
    return { ...settings, fallback_models: [...settings.fallback_models] };
  },

  async assistantModels() {
    await serverLatency(900);
    return modelOptions.map((m) => ({ ...m }));
  },

  async saveAssistantSettings(s) {
    await serverLatency();
    if (new Set([s.model, ...s.fallback_models]).size !== s.fallback_models.length + 1) throw new ApiError('validation', 'Модели не должны повторяться', 400);
    settings.model = s.model;
    settings.fallback_models = [...s.fallback_models];
    settings.updated_at = new Date().toISOString();
    settings.updated_by = ADMIN_EMAIL;
    writeAudit('assistant.model_update', 'app_settings', 'assistant_model', { model: s.model, fallbacks: s.fallback_models });
    return { ...settings, fallback_models: [...settings.fallback_models] };
  },
};
