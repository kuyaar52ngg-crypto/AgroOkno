// Сборка Fastify-приложения: плагины, обработка ошибок, маршруты /v1 и совместимые /api (отчёты, PDF, Меркурий).
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { ApiError } from '../../app/api/_lib/context';
import type { Deps } from './deps';
import { HttpError } from './errors';
import { captureServerError } from './monitoring';
import { adminRoutes } from './routes/admin';
import { assistantRoutes } from './routes/assistant';
import { farmRoutes } from './routes/farms';
import { healthRoutes } from './routes/health';
import { reminderRoutes } from './routes/reminders';
import { reportRoutes } from './routes/reports';

export const API_VERSION = '3.0.0';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string | null };
    token?: string;
  }
}

export async function buildApp(deps: Deps, options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    ...options,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const origins = deps.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, {
    origin: origins.includes('*') ? true : origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
  });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 } });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'АгроОкно · API',
        description:
          'Backend АгроОкно: помощник на OpenRouter (с правиловым fallback), выбор модели администратором, голосовой ввод, напоминания и push, ' +
          'регистрация и участники хозяйства, отчёты (XLSX/PDF), Меркурий и Хорриот (демо). ' +
          'Аутентификация — Bearer access_token Supabase; данные читаются от имени пользователя (RLS).',
        version: API_VERSION,
      },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error: unknown, req, reply) => {
    const e = error as { validation?: unknown; message?: string; statusCode?: number; code?: string; status?: number };
    // 5xx уходят в Sentry (если включён): только метод, шаблон маршрута, статус и id пользователя — без тела, заголовков и query.
    const report = (status: number) => {
      if (status >= 500) captureServerError(error, { method: req.method, route: req.routeOptions?.url, status, userId: req.user?.id });
    };
    if (e instanceof HttpError) {
      report(e.status);
      return reply.status(e.status).send({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
    if (e instanceof ApiError) {
      report(e.status);
      return reply.status(e.status).send({ error: e.message });
    }
    if (e.validation) return reply.status(400).send({ error: `Некорректный запрос: ${e.message ?? 'проверьте поля'}`, code: 'validation' });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_FILES_LIMIT') {
      return reply.status(413).send({ error: 'Запись слишком большая: не больше 5 МБ и 60 секунд', code: 'too_large' });
    }
    const status = e.statusCode && e.statusCode < 500 ? e.statusCode : 500;
    if (status >= 500) {
      app.log.error(error);
      report(status);
    }
    return reply.status(status).send({ error: status >= 500 ? 'Внутренняя ошибка сервера. Попробуйте ещё раз' : (e.message ?? 'Ошибка запроса') });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Маршрут не найден' }));

  await app.register(healthRoutes(deps));
  await app.register(assistantRoutes(deps), { prefix: '/v1/assistant' });
  await app.register(reminderRoutes(deps), { prefix: '/v1' });
  await app.register(farmRoutes(deps), { prefix: '/v1/farms' });
  await app.register(adminRoutes(deps), { prefix: '/v1/admin' });
  await app.register(reportRoutes());

  return app;
}
