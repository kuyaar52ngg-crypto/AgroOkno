// Ежедневный запуск напоминаний в 09:00 по часовому поясу хозяйства (TZ_REGION, по умолчанию Asia/Yakutsk).
import cron, { type ScheduledTask } from 'node-cron';

import type { Deps } from '../deps';
import type { Logger } from '../assistant/service';
import { runReminders } from './run';

export const REMINDER_CRON = '0 9 * * *';

export function startReminderCron(deps: Deps, log: Logger & { info(obj: unknown, msg?: string): void }): ScheduledTask | null {
  const { env } = deps;
  if (!env.CRON_ENABLED) {
    log.info({}, 'Cron напоминаний отключён (CRON_ENABLED=false)');
    return null;
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    log.warn({}, 'Cron напоминаний не запущен: нет SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  const task = cron.schedule(
    REMINDER_CRON,
    () => {
      const svc = deps.supabase.service();
      if (!svc) return;
      runReminders({ svc, push: deps.push, tz: env.TZ_REGION, log }).catch((e) =>
        log.warn({ err: e instanceof Error ? e.message : String(e) }, 'Напоминания: сбой запуска'),
      );
    },
    { timezone: env.TZ_REGION },
  );
  log.info({ schedule: REMINDER_CRON, tz: env.TZ_REGION }, 'Cron напоминаний запущен');
  return task;
}
