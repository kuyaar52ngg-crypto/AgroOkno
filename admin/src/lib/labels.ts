// Русские подписи для статусов, ролей и справочников. Незнакомое значение показываем как есть.
import type { ConnectionStatus, LegalStatus, TicketStatus } from '../api/types';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export const ROLE_LABELS: Record<string, string> = {
  farm_head: 'Глава КФХ',
  lph_owner: 'Владелец ЛПХ',
  council_specialist: 'Специалист сельсовета',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Не выбрана';
  return ROLE_LABELS[role] ?? role;
}

export const LEGAL_STATUS_LABELS: Record<LegalStatus, string> = { kfh: 'КФХ', ip: 'ИП', lph: 'ЛПХ' };
export const LEGAL_STATUSES: LegalStatus[] = ['kfh', 'ip', 'lph'];

export function legalStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return LEGAL_STATUS_LABELS[status as LegalStatus] ?? status;
}

export function isLegalStatus(value: string | null | undefined): value is LegalStatus {
  return value === 'kfh' || value === 'ip' || value === 'lph';
}

export const MEMBER_ROLE_LABELS: Record<string, string> = { owner: 'Владелец', member: 'Участник' };

export function memberRoleLabel(role: string): string {
  return MEMBER_ROLE_LABELS[role] ?? role;
}

export const TICKET_STATUSES: TicketStatus[] = ['new', 'in_progress', 'answered', 'closed'];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'Новое',
  in_progress: 'В работе',
  answered: 'Отвечено',
  closed: 'Закрыто',
};
const TICKET_TONES: Record<TicketStatus, Tone> = { new: 'warning', in_progress: 'info', answered: 'success', closed: 'neutral' };

export function isTicketStatus(value: string | null | undefined): value is TicketStatus {
  return value === 'new' || value === 'in_progress' || value === 'answered' || value === 'closed';
}

export function ticketStatusLabel(status: string): string {
  return isTicketStatus(status) ? TICKET_STATUS_LABELS[status] : status;
}

export function ticketStatusTone(status: string): Tone {
  return isTicketStatus(status) ? TICKET_TONES[status] : 'neutral';
}

export function connectionLabel(status: ConnectionStatus | string | null | undefined): string {
  if (status === 'connected_demo') return 'Подключено (демо)';
  if (status === 'not_connected' || !status) return 'Не подключено';
  return status;
}

export function connectionTone(status: string | null | undefined): Tone {
  return status === 'connected_demo' ? 'success' : 'neutral';
}

const JOIN_STATUS_LABELS: Record<string, string> = { pending: 'Ожидает решения', approved: 'Одобрена', rejected: 'Отклонена' };
const JOIN_STATUS_TONES: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'error' };

export function joinStatusLabel(status: string): string {
  return JOIN_STATUS_LABELS[status] ?? status;
}

export function joinStatusTone(status: string): Tone {
  return JOIN_STATUS_TONES[status] ?? 'neutral';
}

const SUBMISSION_STATUS_LABELS: Record<string, string> = { draft: 'Черновик', submitted: 'Сдан', failed: 'Ошибка отправки' };
const SUBMISSION_STATUS_TONES: Record<string, Tone> = { draft: 'neutral', submitted: 'success', failed: 'error' };

export function submissionStatusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status] ?? status;
}

export function submissionStatusTone(status: string): Tone {
  return SUBMISSION_STATUS_TONES[status] ?? 'neutral';
}

/** Формы отчётности (справочник report_deadlines). */
export const FORM_LABELS: Record<string, string> = {
  '3-fermer': 'Форма 3-фермер',
  '3-fermer-month': 'Форма 3-фермер (рег)',
  '1-fermer': 'Форма 1-фермер',
  '2-fermer': 'Форма 2-фермер',
  '1-kfh': 'Форма 1-КФХ',
  '1-ip': 'Форма 1-ИП',
  '1-tabun': 'Форма 1-ТАБУН',
  '10-sh': 'Форма 10-СХ',
  '1-iso-r': 'Форма 1-ИСО-р',
};
export const FORM_CODES = Object.keys(FORM_LABELS);

export function formLabel(code: string): string {
  return FORM_LABELS[code] ?? code;
}

const AUTHORITY_LABELS: Record<string, string> = { rosstat: 'Росстат', minselhoz: 'Минсельхоз России', sakhastat: 'Сахастат' };

export function authorityLabel(authority: string): string {
  return AUTHORITY_LABELS[authority] ?? authority;
}

const PERIOD_KIND_LABELS: Record<string, string> = { year: 'Годовая', month: 'Месячная', any: 'Годовая или месячная' };

export function periodKindLabel(kind: string): string {
  return PERIOD_KIND_LABELS[kind] ?? kind;
}

/** Действия журнала: коды задаёт RPC (admin_audit_log.action); для незнакомых показываем код как есть. */
export const AUDIT_ACTIONS = [
  'user.block',
  'user.unblock',
  'user.grant_admin',
  'user.revoke_admin',
  'deadline.update',
  'ticket.reply',
  'broadcast.send',
  'assistant.model_update',
] as const;

const ACTION_LABELS: Record<string, string> = {
  'user.block': 'Блокировка пользователя',
  'user.unblock': 'Разблокировка пользователя',
  'user.grant_admin': 'Выдача прав администратора',
  'user.revoke_admin': 'Снятие прав администратора',
  'deadline.update': 'Изменение срока отчёта',
  'ticket.reply': 'Ответ на обращение',
  'broadcast.send': 'Рассылка',
  'assistant.model_update': 'Смена модели помощника',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: 'Пользователь',
  farm: 'Хозяйство',
  ticket: 'Обращение',
  support_ticket: 'Обращение',
  deadline: 'Срок отчёта',
  report_deadline: 'Срок отчёта',
  broadcast: 'Рассылка',
  assistant_model: 'Модель помощника',
  app_settings: 'Настройки',
};

export function targetTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return TARGET_TYPE_LABELS[type] ?? type;
}

/** Адрес карточки объекта журнала, если для него есть страница. */
export function targetPath(type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id) return null;
  if (type === 'user') return `/users/${id}`;
  if (type === 'farm') return `/farms/${id}`;
  return null;
}

/** Кому адресована рассылка — по jsonb `target` (формы значения разные: объект, строка). */
export function describeBroadcastTarget(target: unknown): string {
  if (typeof target === 'string') return describeBroadcastTarget({ target });
  if (!target || typeof target !== 'object') return '—';
  const t = target as { target?: unknown; type?: unknown; status?: unknown; farm_ids?: unknown };
  const kind = typeof t.target === 'string' ? t.target : typeof t.type === 'string' ? t.type : null;
  if (kind === 'all') return 'Все хозяйства';
  if (kind === 'status') return `Хозяйства со статусом ${legalStatusLabel(typeof t.status === 'string' ? t.status : null)}`;
  if (kind === 'farms') {
    const n = Array.isArray(t.farm_ids) ? t.farm_ids.length : null;
    return n === null ? 'Выбранные хозяйства' : `Выбранные хозяйства (${n})`;
  }
  return '—';
}
