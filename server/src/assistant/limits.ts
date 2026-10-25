// Лимит запросов к помощнику на пользователя: сообщения и распознавание голоса стоят денег (OpenRouter, STT).
// Скользящее окно в памяти процесса: на Render один экземпляр сервера, после перезапуска счётчики обнуляются.
import { HttpError } from '../errors';

export interface RateLimitOptions {
  perMinute: number;
  perDay: number;
  clock?: () => Date;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface RateLimiter {
  /** Учитывает запрос; при превышении — HttpError 429 с подсказкой, когда повторить. */
  hit(userId: string): void;
}

export function createRateLimiter({ perMinute, perDay, clock = () => new Date() }: RateLimitOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  const sweep = (now: number) => {
    if (now - lastSweep < MINUTE) return;
    lastSweep = now;
    for (const [user, list] of hits) if (list[list.length - 1] <= now - DAY) hits.delete(user);
  };

  return {
    hit(userId) {
      const now = clock().getTime();
      sweep(now);
      const list = (hits.get(userId) ?? []).filter((t) => t > now - DAY);
      const lastMinute = list.filter((t) => t > now - MINUTE);
      if (perMinute > 0 && lastMinute.length >= perMinute) {
        const wait = Math.max(1, Math.ceil((lastMinute[0] + MINUTE - now) / 1000));
        hits.set(userId, list);
        throw new HttpError(429, `Слишком много сообщений подряд. Подождите ${wait} с`, 'rate_limited');
      }
      if (perDay > 0 && list.length >= perDay) {
        hits.set(userId, list);
        throw new HttpError(429, 'Дневной лимит сообщений помощнику исчерпан. Попробуйте завтра', 'rate_limited_day');
      }
      list.push(now);
      hits.set(userId, list);
    },
  };
}
