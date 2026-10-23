// Задача напоминаний: сроки отчётов каждого хозяйства → notifications + сообщение в чат + Expo push.
// Без дублей: перед отправкой строка резервируется в reminder_log (уникальный ключ farm/form/period/kind).
// Сервисный ключ используется только здесь.
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { loadFarmData } from '../../../app/api/_lib/context';
import type { DeadlineReminder } from '../../../app/src/data/contract';
import { fmtDate, plural } from '../../../app/src/reports/format';
import { computeReminderObligations, periodKey, shortFormTitle } from '../../../app/src/reports/reminders';
import { todayIn } from '../time';
import type { PushSender, PushMessage } from './push';

export type ReminderKind = '7d' | '1d' | 'overdue';

export interface MemberSettings {
  user_id: string;
  push_enabled: boolean;
  sound: boolean;
  deadline_reminders: boolean;
  reminders_in_chat: boolean;
  remind_7_days: boolean;
  remind_1_day: boolean;
}

export const DEFAULT_MEMBER_SETTINGS: Omit<MemberSettings, 'user_id'> = {
  push_enabled: true,
  sound: false,
  deadline_reminders: true,
  reminders_in_chat: true,
  remind_7_days: true,
  remind_1_day: true,
};

/** Какой тип напоминания нужен при таком остатке дней (null — рано). */
export function kindFor(daysLeft: number): ReminderKind | null {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 1) return '1d';
  if (daysLeft <= 7) return '7d';
  return null;
}

/** Включён ли этот тип у пользователя (J8: «За 7 дней», «За 1 день»; просрочки — общий переключатель). */
export function kindEnabled(s: MemberSettings, kind: ReminderKind): boolean {
  if (!s.deadline_reminders) return false;
  if (kind === '7d') return s.remind_7_days;
  if (kind === '1d') return s.remind_1_day;
  return true;
}

const dayWord = (n: number) => plural(n, ['день', 'дня', 'дней']);

/** Тексты уведомления: «До сдачи 1-ИСО-р осталось 7 дней» / «1-ТАБУН · просрочен на 3 дня». */
export function reminderText(r: DeadlineReminder, kind: ReminderKind): { title: string; body: string } {
  const date = fmtDate(r.due_on);
  if (kind === 'overdue') {
    const n = -r.days_left;
    return { title: `${r.title} · просрочен на ${n} ${dayWord(n)}`, body: `Срок истек ${date}. Откройте отчет и проверьте данные.` };
  }
  const title = r.days_left === 0 ? `Сегодня последний день сдачи ${r.title}` : `До сдачи ${r.title} осталось ${r.days_left} ${dayWord(r.days_left)}`;
  return { title, body: `Срок: ${date}. Отправку вы подтверждаете сами, после проверки данных.` };
}

export interface RunSummary {
  today: string;
  farms: number;
  reminders: number;
  notifications: number;
  chat_messages: number;
  push_sent: number;
  push_failed: number;
  skipped_duplicates: number;
  errors: string[];
}

export interface RunOptions {
  svc: SupabaseClient;
  push: PushSender;
  tz: string;
  now?: Date;
  /** Не писать и не отправлять — только посчитать. */
  dryRun?: boolean;
  log?: { warn(obj: unknown, msg?: string): void; info(obj: unknown, msg?: string): void };
}

export async function runReminders(options: RunOptions): Promise<RunSummary> {
  const { svc, push, tz, log } = options;
  const today = todayIn(tz, options.now);
  const summary: RunSummary = {
    today, farms: 0, reminders: 0, notifications: 0, chat_messages: 0, push_sent: 0, push_failed: 0, skipped_duplicates: 0, errors: [],
  };

  const { data: farms, error } = await svc.from('farms').select('id, name').is('deleted_at', null);
  if (error) throw new Error(`Не удалось прочитать хозяйства: ${error.message}`);

  for (const farm of farms ?? []) {
    summary.farms += 1;
    try {
      await remindFarm(options, today, farm.id as string, summary);
    } catch (e) {
      const msg = `${farm.name}: ${e instanceof Error ? e.message : String(e)}`;
      summary.errors.push(msg);
      log?.warn({ farm: farm.id, err: msg }, 'Напоминания: ошибка по хозяйству');
    }
  }
  if (!options.dryRun) await svc.rpc('purge_old_chat_messages');
  log?.info(summary, 'Напоминания выполнены');
  return summary;
}

async function remindFarm(options: RunOptions, today: string, farmId: string, summary: RunSummary): Promise<void> {
  const { svc, push } = options;
  const data = await loadFarmData(svc, farmId);

  const { data: memberRows } = await svc.from('farm_members').select('user_id').eq('farm_id', farmId);
  const userIds = (memberRows ?? []).map((m) => m.user_id as string);
  if (userIds.length === 0) return;
  const { data: settingRows } = await svc.from('user_settings').select('*').in('user_id', userIds).is('deleted_at', null);
  const members: MemberSettings[] = userIds.map((id) => {
    const row = (settingRows ?? []).find((s) => s.user_id === id);
    return { user_id: id, ...DEFAULT_MEMBER_SETTINGS, ...(row ? pickSettings(row) : {}) };
  });

  const items = computeReminderObligations({ data, today }, { horizonDays: 7 });
  for (const { obligation, days_left } of items) {
    const kind = kindFor(days_left);
    if (!kind) continue;
    const recipients = members.filter((m) => kindEnabled(m, kind));
    summary.reminders += 1;
    if (recipients.length === 0) continue;

    const reminder: DeadlineReminder = {
      form_code: obligation.form_code,
      title: shortFormTitle(obligation.title),
      due_on: obligation.due_on,
      days_left,
      status: obligation.status,
    };
    const { title, body } = reminderText(reminder, kind);
    if (options.dryRun) {
      summary.notifications += 1;
      continue;
    }

    // Резервируем отправку: при гонке или повторном запуске вторая вставка упадёт на уникальном ключе.
    const claim = await svc.from('reminder_log').insert({ farm_id: farmId, form_code: obligation.form_code, period: periodKey(obligation), kind });
    if (claim.error) {
      if (claim.error.code === '23505') {
        summary.skipped_duplicates += 1;
        continue;
      }
      throw new Error(`reminder_log: ${claim.error.message}`);
    }

    const rollback = () =>
      svc.from('reminder_log').delete().eq('farm_id', farmId).eq('form_code', obligation.form_code).eq('period', periodKey(obligation)).eq('kind', kind);

    const note = await svc
      .from('notifications')
      .insert({ id: randomUUID(), farm_id: farmId, kind: kind === 'overdue' ? 'overdue' : 'deadline', title, body, form_code: obligation.form_code });
    if (note.error) {
      await rollback();
      throw new Error(`notifications: ${note.error.message}`);
    }
    summary.notifications += 1;

    const chatUsers = recipients.filter((m) => m.reminders_in_chat);
    if (chatUsers.length > 0) {
      const chat = await svc.from('chat_messages').insert(
        chatUsers.map((m) => ({
          id: randomUUID(),
          farm_id: farmId,
          user_id: m.user_id,
          role: 'assistant',
          text: `${title}. ${body}`,
          cards: [{ kind: 'deadline', reminder }],
        })),
      );
      if (chat.error) log_warn(options, chat.error.message);
      else summary.chat_messages += chatUsers.length;
    }

    const pushUsers = recipients.filter((m) => m.push_enabled);
    if (pushUsers.length > 0) {
      const { data: tokens } = await svc.from('push_tokens').select('user_id, token').in('user_id', pushUsers.map((m) => m.user_id));
      const messages: PushMessage[] = (tokens ?? []).map((t) => ({
        to: t.token as string,
        title,
        body,
        sound: pushUsers.find((m) => m.user_id === t.user_id)?.sound ? 'default' : null,
        data: { form_code: obligation.form_code, kind },
      }));
      if (messages.length > 0) {
        const results = await push.send(messages);
        for (const r of results) {
          if (r.ok) summary.push_sent += 1;
          else summary.push_failed += 1;
          if (r.invalidToken) await svc.from('push_tokens').delete().eq('token', r.token);
        }
      }
    }
  }
}

function log_warn(options: RunOptions, msg: string) {
  options.log?.warn({ err: msg }, 'Напоминания: не удалось добавить сообщение в чат');
}

function pickSettings(row: Record<string, unknown>): Partial<Omit<MemberSettings, 'user_id'>> {
  const out: Partial<Omit<MemberSettings, 'user_id'>> = {};
  for (const key of Object.keys(DEFAULT_MEMBER_SETTINGS) as (keyof typeof DEFAULT_MEMBER_SETTINGS)[]) {
    if (typeof row[key] === 'boolean') out[key] = row[key] as boolean;
  }
  return out;
}
