import { timingSafeEqual } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { bearer, requireUser, userDb } from '../auth';
import type { Deps } from '../deps';
import { fromPostgres, HttpError } from '../errors';
import { runReminders } from '../reminders/run';

const settingsPatch = z
  .object({
    push_enabled: z.boolean(),
    sound: z.boolean(),
    deadline_reminders: z.boolean(),
    reminders_in_chat: z.boolean(),
    remind_7_days: z.boolean(),
    remind_1_day: z.boolean(),
  })
  .partial();

const DEFAULTS = {
  push_enabled: true,
  sound: false,
  deadline_reminders: true,
  reminders_in_chat: true,
  remind_7_days: true,
  remind_1_day: true,
};
const KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function pick(row: Record<string, unknown> | null | undefined) {
  const out: Record<string, boolean> = { ...DEFAULTS };
  for (const k of KEYS) if (typeof row?.[k] === 'boolean') out[k] = row[k] as boolean;
  return out;
}

export const reminderRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();

    app.get(
      '/reminders/settings',
      { preHandler: requireUser(deps), schema: { tags: ['reminders'], summary: 'Настройки напоминаний (J8)', security: [{ bearer: [] }] } },
      async (req) => {
        const { data, error } = await userDb(deps, req).from('user_settings').select('*').eq('user_id', req.user!.id).maybeSingle();
        if (error) throw fromPostgres(error);
        return pick(data);
      },
    );

    app.put(
      '/reminders/settings',
      {
        preHandler: requireUser(deps),
        schema: { tags: ['reminders'], summary: 'Сохранить настройки напоминаний', security: [{ bearer: [] }], body: settingsPatch },
      },
      async (req) => {
        const db = userDb(deps, req);
        const { data: existing } = await db.from('user_settings').select('*').eq('user_id', req.user!.id).maybeSingle();
        const merged = { ...pick(existing), ...req.body };
        const { error } = await db
          .from('user_settings')
          .upsert({ ...(existing ?? {}), user_id: req.user!.id, ...merged, deleted_at: null }, { onConflict: 'user_id' });
        if (error) throw fromPostgres(error);
        return merged;
      },
    );

    app.post(
      '/reminders/run',
      {
        schema: {
          tags: ['reminders'],
          summary: 'Ручной запуск напоминаний',
          description: 'Authorization: Bearer <CRON_SECRET>. Параметр dry_run=true — только посчитать, ничего не отправлять.',
          querystring: z.object({ dry_run: z.enum(['true', 'false']).optional() }),
        },
      },
      async (req) => {
        const secret = deps.env.CRON_SECRET;
        if (!secret) throw new HttpError(503, 'CRON_SECRET не настроен на сервере', 'cron_not_configured');
        const given = bearer(req);
        if (!given || !safeEqual(given, secret)) throw new HttpError(401, 'Неверный секрет запуска', 'unauthorized');
        const svc = deps.supabase.service();
        if (!svc) throw new HttpError(503, 'SUPABASE_SERVICE_ROLE_KEY не настроен на сервере', 'service_key_missing');
        return runReminders({
          svc,
          push: deps.push,
          tz: deps.env.TZ_REGION,
          now: deps.clock(),
          dryRun: req.query.dry_run === 'true',
          log: req.log,
        });
      },
    );

    app.post(
      '/push-tokens',
      {
        preHandler: requireUser(deps),
        schema: {
          tags: ['reminders'],
          summary: 'Регистрация Expo push-токена',
          security: [{ bearer: [] }],
          body: z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) }),
        },
      },
      async (req) => {
        const { error } = await userDb(deps, req).rpc('register_push_token', { p_token: req.body.token, p_platform: req.body.platform });
        if (error) throw fromPostgres(error);
        return { ok: true };
      },
    );
  };
