// Конфигурация сервера из переменных окружения (zod) с понятными ошибками на русском.
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('true')
  .transform((v) => v === '' || v === 'true' || v === '1');

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SUPABASE_URL: z.string().url('SUPABASE_URL должен быть URL проекта Supabase'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10, 'SUPABASE_PUBLISHABLE_KEY не задан'),
  SUPABASE_SERVICE_ROLE_KEY: optional,

  // Помощник: OpenRouter (OpenAI-формат). Без ключа — правиловый разбор. Модель обычно берётся из БД (админ-панель),
  // OPENROUTER_MODEL — запасной вариант, если БД недоступна.
  OPENROUTER_API_KEY: optional,
  OPENROUTER_MODEL: z.string().trim().min(1).default('anthropic/claude-haiku-5.5'),
  OPENROUTER_BASE_URL: z.string().url('OPENROUTER_BASE_URL должен быть URL').default('https://openrouter.ai/api/v1'),

  STT_PROVIDER: z.enum(['mock', 'yandex', 'openai']).default('mock'),
  YANDEX_API_KEY: optional,
  YANDEX_FOLDER_ID: optional,
  OPENAI_API_KEY: optional,
  OPENAI_STT_MODEL: z.string().default('whisper-1'),

  CRON_SECRET: optional,
  CRON_ENABLED: bool,
  TZ_REGION: z.string().default('Asia/Yakutsk'),
  CORS_ORIGINS: z.string().default('*'),
  AGRO_TEMPLATES_DIR: optional,
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {}

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  • ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new EnvError(`Некорректная конфигурация сервера (.env):\n${lines.join('\n')}\nСм. server/.env.example`);
  }
  const env = result.data;
  if (env.STT_PROVIDER === 'yandex' && (!env.YANDEX_API_KEY || !env.YANDEX_FOLDER_ID)) {
    throw new EnvError('STT_PROVIDER=yandex требует YANDEX_API_KEY и YANDEX_FOLDER_ID');
  }
  if (env.STT_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new EnvError('STT_PROVIDER=openai требует OPENAI_API_KEY');
  }
  return env;
}

/** Загружает server/.env (если есть) и разбирает окружение. */
export function loadEnv(): Env {
  try {
    process.loadEnvFile();
  } catch {
    // .env нет — используем переменные окружения процесса
  }
  const env = parseEnv();
  // Общие обработчики app/api читают EXPO_PUBLIC_*: подставляем значения сервера.
  process.env.EXPO_PUBLIC_SUPABASE_URL ??= env.SUPABASE_URL;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= env.SUPABASE_PUBLISHABLE_KEY;
  return env;
}
