// Админ-панель: модель помощника для всех пользователей, блокировка пользователей и рассылки с Expo push.
// Права — таблица app_admins (RPC is_app_admin от имени пользователя). Данные панели (сводка, списки, ответы поддержки)
// читаются и пишутся RPC admin_* прямо из веб-панели; сервер нужен там, где требуется сервисный ключ (auth.admin, push_tokens).
// Модель хранится в БД (app_settings, ключ assistant_model); сервер читает её с кешем 30 с.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { sendBroadcastPush } from '../admin/push';
import { parseSettings } from '../assistant/models';
import { requireUser, userDb } from '../auth';
import type { Deps } from '../deps';
import { fromPostgres, HttpError } from '../errors';

const MAX_FALLBACKS = 3;

const settingsOut = z.object({
  model: z.string().describe('Основная модель OpenRouter, например anthropic/claude-haiku-5.5'),
  fallback_models: z.array(z.string()).describe('Запасные модели по порядку (до трёх)'),
  updated_at: z.string().nullable().describe('Когда настройку меняли в последний раз (null — значения по умолчанию)'),
  updated_by: z.string().nullable().describe('Email администратора, изменившего настройку'),
});

const modelId = z.string().trim().min(1, 'Укажите модель').max(200, 'Идентификатор модели слишком длинный');

const settingsBody = z
  .object({
    model: modelId,
    fallback_models: z.array(modelId).max(MAX_FALLBACKS, 'Запасных моделей — не больше трёх').default([]),
  })
  .superRefine((v, ctx) => {
    const all = [v.model, ...v.fallback_models];
    if (new Set(all).size !== all.length) ctx.addIssue({ code: 'custom', path: ['fallback_models'], message: 'Модели не должны повторяться' });
  });

const modelsOut = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      free: z.boolean().describe('Бесплатная: id оканчивается на :free или цена prompt и completion равна нулю'),
      context_length: z.number().nullable(),
    }),
  ),
});

const NO_SERVICE_KEY = 'На сервере не задан SUPABASE_SERVICE_ROLE_KEY';
/** Бессрочная блокировка: Supabase Auth принимает только длительность, поэтому ~100 лет. */
const BAN_FOREVER = '876000h';

const userParams = z.object({ id: z.uuid('Некорректный идентификатор пользователя') });

const blockBody = z
  .object({ reason: z.string().trim().max(500, 'Причина — не длиннее 500 символов').optional().describe('Причина блокировки (попадёт в журнал действий)') })
  .nullish();

const blockOut = z.object({
  user_id: z.string(),
  blocked: z.boolean().describe('true — пользователь заблокирован, false — блокировка снята'),
  banned_until: z.string().nullable().describe('До какого времени действует блокировка (null — не заблокирован)'),
});

const broadcastBody = z
  .object({
    title: z.string().trim().min(1, 'Укажите заголовок').max(120, 'Заголовок — не длиннее 120 символов'),
    body: z.string().trim().min(1, 'Укажите текст').max(2000, 'Текст — не длиннее 2000 символов'),
    target: z.enum(['all', 'status', 'farms']).describe('all — всем хозяйствам, status — по юридическому статусу, farms — выбранным'),
    status: z.enum(['kfh', 'ip', 'lph']).nullish().describe('Статус хозяйства для target = status'),
    farm_ids: z.array(z.uuid()).max(1000, 'Выбрано слишком много хозяйств').nullish().describe('Хозяйства для target = farms'),
  })
  .superRefine((v, ctx) => {
    if (v.target === 'status' && !v.status) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Выберите статус хозяйства' });
    if (v.target === 'farms' && !v.farm_ids?.length) ctx.addIssue({ code: 'custom', path: ['farm_ids'], message: 'Выберите хозяйства для рассылки' });
  });

const broadcastRpc = z.object({ broadcast_id: z.string(), farms_count: z.number().int(), user_ids: z.array(z.string()) });

const broadcastOut = z.object({
  broadcast_id: z.string(),
  farms_count: z.number().int().describe('Сколько хозяйств получили уведомление в приложении'),
  push_sent: z.number().int().describe('Сколько push принял Expo (0 — нет сервисного ключа, токенов или push отключён у получателей)'),
});

export const adminRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    app.addHook('preHandler', requireUser(deps));
    const security = [{ bearer: [] }];
    const tags = ['admin'];

    // Панель вызывает POST без тела, но с Content-Type: application/json (разблокировка): пустое тело считаем пустым объектом,
    // а не ошибкой Fastify. Парсер действует только внутри /v1/admin; защита от __proto__ остаётся как у стандартного.
    const jsonParser = instance.getDefaultJsonParser('error', 'error');
    instance.removeContentTypeParser('application/json');
    instance.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const text = body.toString();
      if (text.trim() === '') return done(null, {});
      jsonParser(req, text, done);
    });

    /** Проверка прав администратора (RPC is_app_admin от имени пользователя); иначе 403. */
    async function requireAdmin(req: Parameters<typeof userDb>[1], message: string): Promise<void> {
      const { data, error } = await userDb(deps, req).rpc('is_app_admin');
      if (error) throw fromPostgres(error);
      if (data !== true) throw new HttpError(403, message, 'forbidden');
    }

    /** Сервисный клиент для действий, которые нельзя сделать от имени пользователя; без ключа — 503. */
    function requireService(): SupabaseClient {
      const svc = deps.supabase.service();
      if (!svc) throw new HttpError(503, NO_SERVICE_KEY, 'service_key_missing');
      return svc;
    }

    /** Строка журнала действий (сервисным ключом). Email администратора — из app_admins, а не из токена (там технический email). */
    async function auditUser(
      svc: SupabaseClient,
      req: Parameters<typeof userDb>[1],
      action: 'user.block' | 'user.unblock',
      targetId: string,
      details: Record<string, unknown>,
    ): Promise<void> {
      try {
        const { data: admin } = await svc.from('app_admins').select('email').eq('user_id', req.user!.id).maybeSingle();
        const { error } = await svc.from('admin_audit_log').insert({
          admin_id: req.user!.id,
          admin_email: (admin?.email as string | undefined) ?? req.user!.email,
          action,
          target_type: 'user',
          target_id: targetId,
          details,
        });
        if (error) req.log.warn({ err: error.message, action }, 'Журнал действий: не удалось записать строку');
      } catch (e) {
        req.log.warn({ err: e instanceof Error ? e.message : String(e), action }, 'Журнал действий: не удалось записать строку');
      }
    }

    /** Блокировка/разблокировка через Supabase Auth (ban_duration). Результат — banned_until из ответа Auth. */
    async function setBan(req: Parameters<typeof userDb>[1], userId: string, banDuration: string): Promise<string | null> {
      const svc = requireService();
      const { data, error } = await svc.auth.admin.updateUserById(userId, { ban_duration: banDuration });
      if (error) {
        if (error.status === 404 || error.code === 'user_not_found') throw new HttpError(404, 'Пользователь не найден', 'user_not_found');
        req.log.warn({ err: error.message, userId }, 'Supabase Auth: не удалось изменить блокировку');
        throw new HttpError(502, 'Не удалось изменить блокировку пользователя. Попробуйте позже', 'auth_admin_failed');
      }
      return data.user?.banned_until ?? null;
    }

    app.get(
      '/me',
      {
        schema: {
          tags,
          summary: 'Права администратора',
          description: 'is_admin = true, если id текущего пользователя есть в app_admins.',
          security,
          response: { 200: z.object({ is_admin: z.boolean() }) },
        },
      },
      async (req) => {
        const { data, error } = await userDb(deps, req).rpc('is_app_admin');
        if (error) throw fromPostgres(error);
        return { is_admin: data === true };
      },
    );

    app.get(
      '/assistant-settings',
      {
        schema: {
          tags,
          summary: 'Модель помощника (настройка для всех пользователей)',
          description: 'Читать может любой авторизованный пользователь. Нет записи в БД — значения по умолчанию.',
          security,
          response: { 200: settingsOut },
        },
      },
      async (req) => {
        const { data, error } = await userDb(deps, req).rpc('get_assistant_model_settings');
        if (error) throw fromPostgres(error);
        const settings = parseSettings(data);
        if (!settings) throw new HttpError(500, 'Не удалось прочитать настройку модели помощника');
        return settings;
      },
    );

    app.put(
      '/assistant-settings',
      {
        schema: {
          tags,
          summary: 'Изменить модель помощника (только администратор)',
          description:
            'Основная модель и до трёх запасных (без повторов). Не администратору — 403. Изменение действует для всех пользователей, ' +
            'сервер подхватывает его сразу на этом узле и не позже чем через 30 секунд на остальных.',
          security,
          body: settingsBody,
          response: { 200: settingsOut },
        },
      },
      async (req) => {
        await requireAdmin(req, 'Менять модель помощника могут только администраторы');
        const { model, fallback_models } = req.body;
        const { data, error } = await userDb(deps, req).rpc('set_assistant_model_settings', { p_model: model, p_fallbacks: fallback_models });
        if (error) throw fromPostgres(error);
        const saved = parseSettings(data);
        if (!saved) throw new HttpError(500, 'Не удалось сохранить настройку модели помощника');
        deps.modelSettings.set(saved);
        return saved;
      },
    );

    app.get(
      '/models',
      {
        schema: {
          tags,
          summary: 'Модели OpenRouter с поддержкой tool calling (только администратор)',
          description:
            'Список из публичного GET /models OpenRouter: только модели, у которых supported_parameters содержит tools. ' +
            'free — id оканчивается на :free или цена prompt и completion равна нулю. Кеш 10 минут.',
          security,
          response: { 200: modelsOut },
        },
      },
      async (req) => {
        await requireAdmin(req, 'Список моделей доступен только администраторам');
        try {
          return { models: await deps.modelCatalog.list() };
        } catch (e) {
          req.log.warn({ err: e instanceof Error ? e.message : String(e) }, 'Список моделей OpenRouter недоступен');
          throw new HttpError(502, 'Не удалось получить список моделей OpenRouter. Попробуйте позже', 'openrouter_unavailable');
        }
      },
    );

    app.post(
      '/users/:id/block',
      {
        schema: {
          tags,
          summary: 'Заблокировать пользователя (только администратор)',
          description:
            'Supabase Auth: ban_duration = 876000h (бессрочно), заблокированный не сможет войти и обновить сессию; уже выданный access_token ' +
            'действует до истечения срока (обычно час). Строка user.block пишется в admin_audit_log. Нужен SUPABASE_SERVICE_ROLE_KEY на сервере ' +
            '(без него 503). Себя заблокировать нельзя (400). Не администратору — 403, неизвестному пользователю — 404.',
          security,
          params: userParams,
          body: blockBody,
          response: { 200: blockOut },
        },
      },
      async (req) => {
        await requireAdmin(req, 'Блокировать пользователей могут только администраторы');
        const userId = req.params.id;
        if (userId === req.user!.id) throw new HttpError(400, 'Нельзя заблокировать самого себя', 'self_block');
        const svc = requireService();
        const bannedUntil = await setBan(req, userId, BAN_FOREVER);
        const reason = req.body?.reason;
        await auditUser(svc, req, 'user.block', userId, reason ? { reason } : {});
        return { user_id: userId, blocked: true, banned_until: bannedUntil };
      },
    );

    app.post(
      '/users/:id/unblock',
      {
        schema: {
          tags,
          summary: 'Разблокировать пользователя (только администратор)',
          description:
            'Supabase Auth: ban_duration = none. Строка user.unblock пишется в admin_audit_log. Нужен SUPABASE_SERVICE_ROLE_KEY на сервере ' +
            '(без него 503). Тело запроса не нужно.',
          security,
          params: userParams,
          response: { 200: blockOut },
        },
      },
      async (req) => {
        await requireAdmin(req, 'Разблокировать пользователей могут только администраторы');
        const userId = req.params.id;
        const svc = requireService();
        const bannedUntil = await setBan(req, userId, 'none');
        await auditUser(svc, req, 'user.unblock', userId, {});
        return { user_id: userId, blocked: bannedUntil !== null && new Date(bannedUntil) > deps.clock(), banned_until: bannedUntil };
      },
    );

    app.post(
      '/broadcasts',
      {
        schema: {
          tags,
          summary: 'Рассылка хозяйствам: уведомление в приложении и Expo push (только администратор)',
          description:
            'RPC admin_broadcast от имени администратора создаёт уведомление (kind = admin) каждому хозяйству выбранной группы, историю рассылки ' +
            'и строку журнала broadcast.send; затем сервер отправляет Expo push владельцам и одобренным участникам (push_tokens, только тем, у кого ' +
            'не отключён push) и записывает push_sent. Без SUPABASE_SERVICE_ROLE_KEY отправляются только уведомления в приложении, push_sent = 0. ' +
            'Сбой push не отменяет рассылку. target: all — все хозяйства, status — по статусу (kfh | ip | lph), farms — по farm_ids.',
          security,
          body: broadcastBody,
          response: { 200: broadcastOut },
        },
      },
      async (req) => {
        await requireAdmin(req, 'Делать рассылки могут только администраторы');
        const v = req.body;
        const { data, error } = await userDb(deps, req).rpc('admin_broadcast', {
          p_title: v.title,
          p_body: v.body,
          p_target: v.target,
          p_status: v.target === 'status' ? (v.status ?? null) : null,
          p_farm_ids: v.target === 'farms' ? (v.farm_ids ?? null) : null,
        });
        if (error) throw fromPostgres(error);
        const result = broadcastRpc.safeParse(data);
        if (!result.success) throw new HttpError(500, 'Не удалось прочитать результат рассылки');
        const { broadcast_id, farms_count, user_ids } = result.data;

        let pushSent = 0;
        const svc = deps.supabase.service();
        if (svc) {
          try {
            pushSent = await sendBroadcastPush({ svc, push: deps.push, userIds: user_ids, title: v.title, body: v.body, broadcastId: broadcast_id, log: req.log });
          } catch (e) {
            req.log.warn({ err: e instanceof Error ? e.message : String(e), broadcast_id }, 'Рассылка: push не отправлен');
          }
        }
        return { broadcast_id, farms_count, push_sent: pushSent };
      },
    );
  };
