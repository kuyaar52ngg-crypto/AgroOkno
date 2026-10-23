// Сервис помощника: выбирает движок (Claude или правила), при сбое Claude — запасной правиловый разбор.
import { randomUUID } from 'node:crypto';

import type { ChatMessage } from '../../../app/src/data/contract';
import { rulesEngine } from './rules';
import type { AssistantContext, AssistantEngine, EngineOutput, HistoryItem, NewEvent } from './types';

export interface AssistantResponse {
  reply: ChatMessage;
  proposed_events: NewEvent[];
  needs_clarification: boolean;
}

export interface AssistantService {
  readonly engine: 'claude' | 'rules';
  respond(input: { text: string; context: AssistantContext; history: HistoryItem[] }): Promise<AssistantResponse & { engine_used: 'claude' | 'rules' }>;
}

export interface Logger {
  warn(obj: unknown, msg?: string): void;
}

export function toResponse(out: EngineOutput, now: Date): AssistantResponse {
  const reply: ChatMessage = {
    id: randomUUID(),
    role: 'assistant',
    text: out.text,
    created_at: now.toISOString(),
    ...(out.cards && out.cards.length > 0 ? { cards: out.cards } : {}),
  };
  return { reply, proposed_events: out.proposed_events, needs_clarification: out.needs_clarification };
}

export function createAssistantService(primary: AssistantEngine, log: Logger, clock: () => Date = () => new Date()): AssistantService {
  return {
    engine: primary.name,
    async respond(input) {
      let used: 'claude' | 'rules' = primary.name;
      let out: EngineOutput;
      try {
        out = await primary.respond(input);
      } catch (e) {
        if (primary.name === 'rules') throw e;
        log.warn({ err: e instanceof Error ? e.message : String(e) }, 'Claude недоступен — используем правиловый разбор');
        used = 'rules';
        out = await rulesEngine.respond(input);
      }
      return { ...toResponse(out, clock()), engine_used: used };
    },
  };
}
