// Зависимости приложения: собираются из env в проде и подменяются в тестах.
import type { Env } from './env';
import { createModelCatalog, createModelSettingsStore, type ModelCatalog, type ModelSettingsStore } from './assistant/models';
import { createOpenRouterEngine } from './assistant/openrouter';
import { rulesEngine } from './assistant/rules';
import { createAssistantService, type AssistantService, type Logger } from './assistant/service';
import { createSttProvider, type SttProvider } from './stt';
import { createSupabaseFactory, type SupabaseFactory } from './supabase';
import type { PushSender } from './reminders/push';
import { createExpoPushSender } from './reminders/push';

export interface Deps {
  env: Env;
  supabase: SupabaseFactory;
  assistant: AssistantService;
  /** Модель помощника из БД (кеш 30 с) с запасным значением из env. */
  modelSettings: ModelSettingsStore;
  /** Список моделей OpenRouter с tool calling для админ-панели (кеш 10 мин). */
  modelCatalog: ModelCatalog;
  stt: SttProvider;
  push: PushSender;
  clock: () => Date;
}

export function createDeps(env: Env, log: Logger): Deps {
  const engine = env.OPENROUTER_API_KEY
    ? createOpenRouterEngine({ apiKey: env.OPENROUTER_API_KEY, defaultModel: env.OPENROUTER_MODEL, baseUrl: env.OPENROUTER_BASE_URL })
    : rulesEngine;
  return {
    env,
    supabase: createSupabaseFactory(env),
    assistant: createAssistantService(engine, log),
    modelSettings: createModelSettingsStore({ defaultModel: env.OPENROUTER_MODEL }),
    modelCatalog: createModelCatalog({ baseUrl: env.OPENROUTER_BASE_URL }),
    stt: createSttProvider(env),
    push: createExpoPushSender(),
    clock: () => new Date(),
  };
}
