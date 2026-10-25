import type { FastifyPluginAsync } from 'fastify';

import { API_VERSION } from '../app';
import type { Deps } from '../deps';

export const healthRoutes =
  (deps: Deps): FastifyPluginAsync =>
  async (app) => {
    app.get(
      '/health',
      {
        schema: {
          tags: ['system'],
          summary: 'Статус и активные провайдеры',
          description:
            'providers.llm — openrouter | rules (без OPENROUTER_API_KEY); model — модель помощника из настройки администратора ' +
            '(кеш 30 с, при недоступности БД — OPENROUTER_MODEL), null для правил.',
        },
      },
      async () => {
        const llm = deps.assistant.engine;
        // Настройка читается сервисным ключом (если задан) с коротким ожиданием: health не должен зависеть от БД.
        const model =
          llm === 'rules'
            ? null
            : (
                await Promise.race([
                  deps.modelSettings.get(deps.supabase.service()),
                  new Promise<ReturnType<typeof deps.modelSettings.peek>>((resolve) => setTimeout(() => resolve(deps.modelSettings.peek()), 1500).unref()),
                ])
              ).model;
        return {
          ok: true,
          version: API_VERSION,
          time: deps.clock().toISOString(),
          providers: {
            llm,
            stt: deps.stt.name,
            push: 'expo',
            cron: deps.env.CRON_ENABLED && !!deps.env.SUPABASE_SERVICE_ROLE_KEY,
          },
          model,
          tz: deps.env.TZ_REGION,
        };
      },
    );
  };
