// Отправка Expo push (expo-server-sdk). Недействительные токены (DeviceNotRegistered) сообщаются вызывающему для удаления.
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default' | null;
  data?: Record<string, unknown>;
}

export interface PushResult {
  token: string;
  ok: boolean;
  invalidToken: boolean;
  error?: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

export function createExpoPushSender(): PushSender {
  const expo = new Expo();
  return {
    async send(messages) {
      const results: PushResult[] = [];
      const valid: PushMessage[] = [];
      for (const m of messages) {
        if (Expo.isExpoPushToken(m.to)) valid.push(m);
        else results.push({ token: m.to, ok: false, invalidToken: true, error: 'Некорректный Expo push-токен' });
      }
      const payload: ExpoPushMessage[] = valid.map((m) => ({ to: m.to, title: m.title, body: m.body, sound: m.sound, data: m.data, channelId: 'reminders' }));
      let offset = 0;
      for (const chunk of expo.chunkPushNotifications(payload)) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          tickets.forEach((t, i) => {
            const token = valid[offset + i]!.to;
            if (t.status === 'ok') results.push({ token, ok: true, invalidToken: false });
            else results.push({ token, ok: false, invalidToken: t.details?.error === 'DeviceNotRegistered', error: t.message });
          });
        } catch (e) {
          chunk.forEach((_, i) =>
            results.push({ token: valid[offset + i]!.to, ok: false, invalidToken: false, error: e instanceof Error ? e.message : String(e) }),
          );
        }
        offset += chunk.length;
      }
      return results;
    },
  };
}
