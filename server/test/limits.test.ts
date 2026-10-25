import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRateLimiter } from '../src/assistant/limits';
import { HttpError } from '../src/errors';

describe('лимит запросов к помощнику', () => {
  it('пропускает до лимита в минуту, затем 429 с временем ожидания, через минуту снова пускает', () => {
    let now = new Date('2026-10-25T10:00:00Z').getTime();
    const limiter = createRateLimiter({ perMinute: 3, perDay: 100, clock: () => new Date(now) });
    for (let i = 0; i < 3; i++) limiter.hit('u1');
    assert.throws(
      () => limiter.hit('u1'),
      (e) => e instanceof HttpError && e.status === 429 && e.code === 'rate_limited' && /60 с/.test(e.message),
    );
    limiter.hit('u2'); // у другого пользователя свой счётчик
    now += 61_000;
    limiter.hit('u1');
  });

  it('дневной лимит', () => {
    let now = new Date('2026-10-25T10:00:00Z').getTime();
    const limiter = createRateLimiter({ perMinute: 0, perDay: 2, clock: () => new Date(now) });
    limiter.hit('u1');
    now += 3_600_000;
    limiter.hit('u1');
    assert.throws(() => limiter.hit('u1'), (e) => e instanceof HttpError && e.code === 'rate_limited_day');
    now += 24 * 3_600_000;
    limiter.hit('u1');
  });
});
