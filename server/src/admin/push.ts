// Expo push по рассылке администратора: токены пользователей из push_tokens (сервисный ключ), без тех, кто отключил push.
// Сбой отправки не должен ломать рассылку: уведомления в приложении уже созданы RPC admin_broadcast.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PushMessage, PushSender } from '../reminders/push';

/** Сколько user_id уходит в один запрос .in(): длина URL PostgREST ограничена. */
const CHUNK = 100;
/** Текст push короче текста уведомления: длинное читается в приложении. */
const PUSH_BODY_MAX = 180;

interface Log {
  warn(obj: unknown, msg?: string): void;
}

export interface BroadcastPushInput {
  svc: SupabaseClient;
  push: PushSender;
  userIds: string[];
  title: string;
  body: string;
  broadcastId: string;
  log?: Log;
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Отправляет push и возвращает число принятых Expo сообщений; push_sent в admin_broadcasts обновляется здесь же. */
export async function sendBroadcastPush(input: BroadcastPushInput): Promise<number> {
  const { svc, push, userIds, title, body, broadcastId, log } = input;
  if (userIds.length === 0) return 0;

  const messages: PushMessage[] = [];
  const settings = new Map<string, { push_enabled: boolean; sound: boolean }>();
  for (const part of chunks(userIds, CHUNK)) {
    const { data: settingRows, error: settingsError } = await svc.from('user_settings').select('user_id, push_enabled, sound').in('user_id', part).is('deleted_at', null);
    if (settingsError) log?.warn({ err: settingsError.message }, 'Рассылка: не удалось прочитать настройки push');
    for (const s of settingRows ?? []) settings.set(String(s.user_id), { push_enabled: s.push_enabled !== false, sound: s.sound === true });

    const { data: tokens, error: tokensError } = await svc.from('push_tokens').select('user_id, token').in('user_id', part);
    if (tokensError) {
      log?.warn({ err: tokensError.message }, 'Рассылка: не удалось прочитать push-токены');
      continue;
    }
    for (const t of tokens ?? []) {
      const own = settings.get(String(t.user_id));
      if (own && !own.push_enabled) continue;
      messages.push({
        to: String(t.token),
        title,
        body: clip(body, PUSH_BODY_MAX),
        sound: own?.sound ? 'default' : null,
        data: { kind: 'admin', broadcast_id: broadcastId },
      });
    }
  }

  let sent = 0;
  if (messages.length > 0) {
    const results = await push.send(messages);
    for (const r of results) {
      if (r.ok) sent += 1;
      if (r.invalidToken) await svc.from('push_tokens').delete().eq('token', r.token);
    }
  }

  // push_sent по умолчанию 0: без отправленных push строку не трогаем.
  if (sent > 0) {
    const { error } = await svc.from('admin_broadcasts').update({ push_sent: sent }).eq('id', broadcastId);
    if (error) log?.warn({ err: error.message, broadcastId }, 'Рассылка: не удалось записать push_sent');
  }
  return sent;
}
