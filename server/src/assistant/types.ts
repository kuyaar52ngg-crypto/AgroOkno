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

/** Результат работы движка (Claude или правил): текст, события-предложения и карточки. */
export interface EngineOutput {
  text: string;
  proposed_events: NewEvent[];
  needs_clarification: boolean;
  cards?: ChatCard[];
}

export interface AssistantEngine {
  readonly name: 'claude' | 'rules';
  respond(input: { text: string; context: AssistantContext; history: HistoryItem[] }): Promise<EngineOutput>;
}
