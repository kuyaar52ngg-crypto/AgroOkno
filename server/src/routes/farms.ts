import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireUser, userDb } from '../auth';
import type { Deps } from '../deps';
import { fromPostgres } from '../errors';

const createFarm = z.object({
  name: z.string().trim().min(1, 'Укажите название хозяйства').max(120),
  legal_status: z.enum(['kfh', 'ip', 'lph']),
  region: z.string().trim().max(120).default(''),
  settlement: z.string().trim().max(120).default(''),
  inn: z.string().trim().regex(/^(\d{10}|\d{12})$/, 'ИНН — 10 или 12 цифр').nullish(),
});

export const farmRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (instance) => {
    const app = instance.withTypeProvider<ZodTypeProvider>();
    app.addHook('preHandler', requireUser(deps));
    const security = [{ bearer: [] }];

    app.post('/', { schema: { tags: ['farms'], summary: 'Создать хозяйство (R5)', security, body: createFarm } }, async (req, reply) => {
      const b = req.body;
      const { data, error } = await userDb(deps, req).rpc('create_farm', {
        p_name: b.name,
        p_legal_status: b.legal_status,
        p_region: b.region,
        p_settlement: b.settlement,
        p_inn: b.inn ?? null,
      });
      if (error) throw fromPostgres(error);
      return reply.status(201).send(data);
    });

    app.get(
      '/lookup',
      {
        schema: {
          tags: ['farms'],
          summary: 'Найти хозяйство по коду приглашения или ИНН (R7)',
          security,
          querystring: z.object({ q: z.string().trim().min(3).max(40) }),
        },
      },
      async (req) => {
        const { data, error } = await userDb(deps, req).rpc('find_farm', { p_query: req.query.q });
        if (error) throw fromPostgres(error);
        const row = Array.isArray(data) ? data[0] : data;
        return { farm: row ?? null };
      },
    );

    app.post(
      '/join-requests',
      { schema: { tags: ['farms'], summary: 'Запросить доступ к хозяйству (R7→R8)', security, body: z.object({ farm_id: z.string().uuid() }) } },
      async (req, reply) => {
        const { data, error } = await userDb(deps, req).rpc('request_farm_access', { p_farm_id: req.body.farm_id });
        if (error) throw fromPostgres(error);
        return reply.status(201).send(data);
      },
    );

    app.get(
      '/join-requests',
      {
        schema: {
          tags: ['farms'],
          summary: 'Запросы доступа: мои (mine) или входящие для владельца (incoming)',
          security,
          querystring: z.object({ scope: z.enum(['mine', 'incoming']).default('mine') }),
        },
      },
      async (req) => {
        const base = userDb(deps, req).from('farm_join_requests').select('*').order('created_at', { ascending: false });
        const q = req.query.scope === 'mine' ? base.eq('user_id', req.user!.id) : base.neq('user_id', req.user!.id).eq('status', 'pending');
        const { data, error } = await q;
        if (error) throw fromPostgres(error);
        return { requests: data ?? [] };
      },
    );

    for (const [action, approve] of [['approve', true], ['reject', false]] as const) {
      app.post(
        `/join-requests/:id/${action}`,
        {
          schema: {
            tags: ['farms'],
            summary: approve ? 'Подтвердить запрос доступа (владелец)' : 'Отклонить запрос доступа (владелец)',
            security,
            params: z.object({ id: z.string().uuid() }),
          },
        },
        async (req) => {
          const { data, error } = await userDb(deps, req).rpc('resolve_join_request', { p_id: req.params.id, p_approve: approve });
          if (error) throw fromPostgres(error);
          return data;
        },
      );
    }
  };
