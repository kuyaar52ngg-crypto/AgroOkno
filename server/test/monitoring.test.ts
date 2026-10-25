// Мониторинг ошибок: 5xx попадают в репортёр (Sentry), 4xx — нет; без DSN инициализация ничего не делает.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { buildApp } from '../src/app';
import type { Deps } from '../src/deps';
import { parseEnv } from '../src/env';
import { HttpError } from '../src/errors';
import { initMonitoring, setErrorReporter, type ErrorContext } from '../src/monitoring';

const env = parseEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key', CRON_ENABLED: 'false' });

async function appWithRoutes() {
  const deps = { env } as unknown as Deps;
  const app = await buildApp(deps, { logger: false });
  app.get('/__boom', async () => {
    throw new Error('сбой');
  });
  app.get('/__bad', async () => {
    throw new HttpError(400, 'плохой запрос');
  });
  app.get('/__db', async () => {
    throw new HttpError(503, 'база не обновлена');
  });
  return app;
}

describe('мониторинг ошибок', () => {
  afterEach(() => setErrorReporter(null));

  it('без SENTRY_DSN initMonitoring выключен', () => {
    assert.equal(initMonitoring({ dsn: undefined }), false);
  });

  it('5xx уходят в репортёр с методом и маршрутом, 4xx — нет', async () => {
    const seen: { error: unknown; ctx: ErrorContext }[] = [];
    setErrorReporter((error, ctx) => seen.push({ error, ctx }));
    const app = await appWithRoutes();

    assert.equal((await app.inject({ method: 'GET', url: '/__bad' })).statusCode, 400);
    assert.equal(seen.length, 0);

    const boom = await app.inject({ method: 'GET', url: '/__boom?inn=143512345660' });
    assert.equal(boom.statusCode, 500);
    assert.equal((await app.inject({ method: 'GET', url: '/__db' })).statusCode, 503);

    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0].ctx, { method: 'GET', route: '/__boom', status: 500, userId: undefined });
    assert.equal(seen[1].ctx.status, 503);
    await app.close();
  });

  it('падение репортёра не ломает ответ', async () => {
    setErrorReporter(() => {
      throw new Error('sentry недоступен');
    });
    const app = await appWithRoutes();
    assert.equal((await app.inject({ method: 'GET', url: '/__boom' })).statusCode, 500);
    await app.close();
  });
});
