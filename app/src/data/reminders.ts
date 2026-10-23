// Напоминания об отчётах (J8): ближайшие сроки из локальных данных (работает офлайн), настройки в user_settings
// (синхронизируются), регистрация Expo push-токена устройства.
import { nowIso, todayIso } from '../lib/clock';
import { supabase } from '../lib/supabase';
import type { DeadlineReminder, ReminderSettings, UserSettings } from './contract';
import { currentFarmData, currentSettings } from './entities';
import { isNetworkError } from './net';
import { currentUserId } from './session';
import { getDoc, putLocal } from './store';
import { requestSync } from './sync';
import { computeDeadlineReminders } from '../reports/reminders';

export type ReminderSettingsView = ReminderSettings & Pick<UserSettings, 'push_enabled' | 'sound'>;

export function upcomingDeadlines(): DeadlineReminder[] | undefined {
  const data = currentFarmData();
  return data ? computeDeadlineReminders({ data, today: todayIso() }) : undefined;
}

const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function currentReminderSettings(): ReminderSettingsView {
  const id = currentUserId();
  const row = id ? getDoc('user_settings', id)?.data : undefined;
  const base = currentSettings();
  const live = row && !row.deleted_at ? row : undefined;
  return {
    push_enabled: base.push_enabled,
    sound: base.sound,
    reminders_in_chat: flag(live?.reminders_in_chat, true),
    remind_7_days: flag(live?.remind_7_days, true),
    remind_1_day: flag(live?.remind_1_day, true),
  };
}

export function updateReminderSettings(patch: ReminderSettings & Partial<Pick<UserSettings, 'push_enabled' | 'sound'>>): void {
  const user_id = currentUserId();
  if (!user_id) throw new Error('Нет активной сессии');
  const now = nowIso();
  const old = getDoc('user_settings', user_id)?.data;
  const merged = { ...currentSettings(), ...currentReminderSettings(), ...patch };
  putLocal('user_settings', 'user_id', { created_at: now, ...old, user_id, ...merged, updated_at: now, deleted_at: null });
  requestSync();
}

/**
 * Регистрирует Expo push-токен устройства (RPC register_push_token). Ошибки сети и отказ сервера не должны ломать UI:
 * регистрация повторится при следующем запуске, пока токен не сохранится.
 */
export async function registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  if (!token || !currentUserId()) return;
  try {
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform });
    if (error && !isNetworkError(error)) console.warn('[push] токен не сохранён:', error.message);
  } catch (e) {
    if (!isNetworkError(e)) console.warn('[push] токен не сохранён:', e instanceof Error ? e.message : e);
  }
}
