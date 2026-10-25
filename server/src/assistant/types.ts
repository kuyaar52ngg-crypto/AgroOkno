import type { ChatCard, ChatMessage, DeadlineReminder, IsoDate, LivestockGroup, NewEvent } from '../../../app/src/data/contract';

export type { ChatCard, ChatMessage, DeadlineReminder, IsoDate, LivestockGroup, NewEvent };

/** Контекст хозяйства для помощника (собирается из Supabase от имени пользователя). */
export interface AssistantContext {
  today: IsoDate;
  user_name: string | null;
  farm: { id: string; name: string; legal_status: 'kfh' | 'ip' | 'lph'; settlement: string | null; region: string | null } | null;
  herd: { group: LivestockGroup; label: string; heads: number }[];
  deadlines: DeadlineReminder[];
}

export interface HistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

/** Основная модель OpenRouter и запасные (по порядку): параметр models запроса. */
export interface ModelChoice {
  model: string;
  fallbacks: string[];
}

/** Результат работы движка (LLM или правил): текст, события-предложения и карточки. */
export interface EngineOutput {
  text: string;
  proposed_events: NewEvent[];
  needs_clarification: boolean;
  cards?: ChatCard[];
  /** Модель, которая фактически ответила (только для LLM; при откате на запасную — её id). */
  model_used?: string;
}

export type EngineName = 'openrouter' | 'rules';

export interface EngineInput {
  text: string;
  context: AssistantContext;
  history: HistoryItem[];
  /** Настройка модели из БД (кеш 30 с); правиловый движок её игнорирует. */
  models?: ModelChoice;
}

export interface AssistantEngine {
  readonly name: EngineName;
  respond(input: EngineInput): Promise<EngineOutput>;
}
