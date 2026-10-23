// Зависимости приложения: собираются из env в проде и подменяются в тестах.
import type { Env } from './env';
import { createClaudeEngine } from './assistant/claude';
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
  stt: SttProvider;
  push: PushSender;
  clock: () => Date;
}

export function createDeps(env: Env, log: Logger): Deps {
  const engine = env.ANTHROPIC_API_KEY ? createClaudeEngine({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }) : rulesEngine;
  return {
    env,
    supabase: createSupabaseFactory(env),
    assistant: createAssistantService(engine, log),
    stt: createSttProvider(env),
    push: createExpoPushSender(),
    clock: () => new Date(),
  };
}
