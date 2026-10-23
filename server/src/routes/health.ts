import type { FastifyPluginAsync } from 'fastify';

import { API_VERSION } from '../app';
import type { Deps } from '../deps';

export const healthRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (app) => {
    app.get('/health', { schema: { tags: ['system'], summary: 'Статус и активные провайдеры' } }, async () => ({
      ok: true,
      version: API_VERSION,
      time: deps.clock().toISOString(),
      providers: {
        llm: deps.assistant.engine,
        stt: deps.stt.name,
        push: 'expo',
        cron: deps.env.CRON_ENABLED && !!deps.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      tz: deps.env.TZ_REGION,
    }));
  };
