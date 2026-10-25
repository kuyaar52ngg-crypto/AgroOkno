// Точка входа: конфигурация, Fastify, cron напоминаний.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app';
import { createDeps } from './deps';
import { EnvError, loadEnv } from './env';
import { flushMonitoring, initMonitoring } from './monitoring';
import { startReminderCron } from './reminders/cron';

async function main() {
  const env = loadEnv();
  // Sentry — только при заданном SENTRY_DSN; иначе ничего не происходит.
  const monitoring = initMonitoring({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT, release: env.SENTRY_RELEASE });
  // Бланки xlsx и шрифты для общих обработчиков app/api: по умолчанию ../app/templates относительно server/.
  // В собранном бандле (server/dist) каталог на уровень выше — тот же server/.
  const here = path.dirname(fileURLToPath(import.meta.url));
  process.env.AGRO_TEMPLATES_DIR ||= path.resolve(here, '../../app/templates');

  // Логгер Fastify появляется после сборки приложения — сервисы пишут через прокси.
  const logRef: { current: { warn(o: unknown, m?: string): void } } = { current: { warn: (o, m) => console.warn(m, o) } };
  const deps = createDeps(env, { warn: (o, m) => logRef.current.warn(o, m) });

  const app = await buildApp(deps, {
    logger: {
      level: env.LOG_LEVEL,
      ...(process.env.NODE_ENV === 'production'
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
    },
  });
  logRef.current = app.log;
  if (monitoring) app.log.info('Sentry: мониторинг ошибок включён');

  const task = startReminderCron(deps, app.log);
  const shutdown = async () => {
    task?.stop();
    await app.close();
    await flushMonitoring();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch(async (e) => {
  console.error(e instanceof EnvError ? e.message : e);
  await flushMonitoring();
  process.exit(1);
});
