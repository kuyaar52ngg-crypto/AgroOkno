// Движок помощника на OpenRouter: POST {baseUrl}/chat/completions (OpenAI-формат, tool calling) через fetch, без SDK.
// Основная модель и запасные задаются параметром models (OpenRouter сам переключается при отказе провайдера).
// Любая ошибка сети/API, невалидный JSON аргументов или ответ без выбора → исключение, а service.ts откатывается на правила.
import { buildToolDefs, interpret, systemPrompt, type LlmResult, type ToolDef } from './interpret';
import type { AssistantEngine, EngineInput, EngineOutput, HistoryItem, ModelChoice } from './types';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 25_000;
/** Сколько последних реплик истории отправлять модели. */
const HISTORY_LIMIT = 10;

export interface OpenRouterEngineOptions {
  apiKey: string;
  /** Модель по умолчанию (env OPENROUTER_MODEL), если настройка из БД не передана. */
  defaultModel: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Подменяемый fetch для тестов. */
  fetchImpl?: typeof fetch;
  /** Атрибуция приложения на openrouter.ai (заголовки HTTP-Referer и X-Title). */
  referer?: string;
}

/** Инструменты в формате OpenAI: { type: 'function', function: { name, description, parameters } }. */
export const toOpenAiTools = (defs: ToolDef[]) =>
  defs.map((d) => ({ type: 'function' as const, function: { name: d.name, description: d.description, parameters: d.parameters } }));

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** system — первым сообщением; история склеивается в чередующиеся user/assistant, последним идёт текст пользователя. */
export function buildMessages(system: string, history: HistoryItem[], text: string): ChatMessage[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history.slice(-HISTORY_LIMIT)) {
    const last = turns[turns.length - 1];
    if (last && last.role === h.role) last.content = `${last.content}\n${h.text}`;
    else turns.push({ role: h.role, content: h.text });
  }
  if (turns[0]?.role === 'assistant') turns.shift();
  const prev = turns[turns.length - 1];
  if (prev?.role === 'user') prev.content = `${prev.content}\n${text}`;
  else turns.push({ role: 'user', content: text });
  return [{ role: 'system', content: system }, ...turns];
}

interface CompletionBody {
  model?: string;
  choices?: { message?: { content?: unknown; tool_calls?: { type?: string; function?: { name?: string; arguments?: unknown } }[] }; finish_reason?: string }[];
  error?: { message?: string; code?: unknown };
}

/** Список моделей запроса: основная и запасные без повторов. */
export const modelList = (choice: ModelChoice): string[] => [...new Set([choice.model, ...choice.fallbacks].map((m) => m.trim()).filter(Boolean))];

/** Достаёт из ответа первый вызов инструмента (JSON.parse аргументов) и текст. Невалидный JSON → ошибка. */
export function parseCompletion(body: CompletionBody): LlmResult {
  if (body.error) throw new Error(`OpenRouter: ${body.error.message ?? 'ошибка модели'}`);
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error('OpenRouter не вернул ответа (choices пуст)');
  const text = typeof message.content === 'string' ? message.content : null;
  const call = message.tool_calls?.[0];
  if (!call?.function?.name) {
    if (!text?.trim()) throw new Error('OpenRouter вернул пустой ответ без вызова инструмента');
    return { tool: null, text };
  }
  const raw = call.function.arguments;
  let input: unknown = {};
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      input = JSON.parse(raw);
    } catch {
      throw new Error(`Модель вернула невалидный JSON в аргументах ${call.function.name}`);
    }
  } else if (typeof raw === 'object' && raw !== null) {
    input = raw;
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(`Аргументы ${call.function.name} должны быть объектом`);
  return { tool: { name: call.function.name, input: input as Record<string, unknown> }, text };
}

export function createOpenRouterEngine(options: OpenRouterEngineOptions): AssistantEngine {
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${(options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
  const tools = toOpenAiTools(buildToolDefs());

  return {
    name: 'openrouter',
    async respond(input: EngineInput): Promise<EngineOutput> {
      const choice = input.models ?? { model: options.defaultModel, fallbacks: [] };
      const models = modelList(choice);
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': options.referer ?? 'https://agrookno.app',
          // Заголовок HTTP — ByteString (Latin-1): кириллица в X-Title ломает fetch, поэтому латиницей.
          'X-Title': 'AgroOkno',
        },
        body: JSON.stringify({
          models,
          messages: buildMessages(systemPrompt(input.context), input.history, input.text),
          tools,
          max_tokens: 1500,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => ({}))) as CompletionBody;
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? 'ошибка запроса'}`);
      const out = interpret(parseCompletion(body), input.context, input.text);
      return { ...out, model_used: typeof body.model === 'string' && body.model ? body.model : models[0] };
    },
  };
}
