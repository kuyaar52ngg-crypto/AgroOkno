// Движок помощника на Claude (tool use). Модель только предлагает события и текст; сервер не пишет в БД.
// Любая ошибка API, отказ или невалидный ответ → вызывающий код переключается на правиловый разбор.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { litersToKg } from '../../../app/src/reports/period';
import { describeEvent, howToAnswer, reportStatusAnswer, clarification, HELP_TEXT } from './answers';
import { newEventSchema, safeParseNewEvent } from './schemas';
import type { AssistantContext, AssistantEngine, EngineOutput, HistoryItem, NewEvent } from './types';

/** JSON Schema события для tool use: те же поля, что у NewEvent; для продукции добавлено unit (л/кг/шт). */
function eventJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(newEventSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

const proposedEventSchema = z.looseObject({ type: z.string(), unit: z.enum(['l', 'kg', 'pcs']).optional() });

function buildTools(): Anthropic.Tool[] {
  const event = eventJsonSchema();
  // Для молока модель указывает литры + unit = "l": пересчёт в кг (1 л = 1,03 кг) делает сервер.
  return [
    {
      name: 'propose_events',
      description:
        'Предложить события хозяйства для записи в журнал (сервер сам ничего не сохраняет — приложение сохранит после ответа). ' +
        'Используй, когда из фразы понятно, ЧТО и СКОЛЬКО произошло. Молоко: quantity — в литрах и unit="l" (сервер переведёт в кг); ' +
        'другая продукция: unit="kg" или "pcs" для яиц. Даты — YYYY-MM-DD, «сегодня» = текущая дата из контекста.',
      input_schema: {
        type: 'object',
        properties: {
          reply: { type: 'string', description: 'Короткий ответ пользователю по-русски: «Сохранил надой: 120 л за 23 октября».' },
          events: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              ...event,
              // unit принимается дополнительно к полям NewEvent (удаляется на сервере)
            },
          },
          units: {
            type: 'array',
            description: 'Единица количества для каждого события по порядку: l (литры), kg, pcs (штуки) или null, если не продукция.',
            items: { type: ['string', 'null'], enum: ['l', 'kg', 'pcs', null] },
          },
        },
        required: ['reply', 'events'],
      },
    },
    {
      name: 'ask_clarification',
      description:
        'Не хватает данных для записи (например, нет количества или не ясны животные). Задай ОДИН короткий уточняющий вопрос и сообщи, что пока ничего не сохранено.',
      input_schema: {
        type: 'object',
        properties: { question: { type: 'string', description: 'Вопрос по-русски, например: «Сколько литров молока получили сегодня? Пока ничего не сохранил.»' } },
        required: ['question'],
      },
    },
    {
      name: 'report_status',
      description: 'Вопрос про ближайшие сроки сдачи отчётов или просрочки. Сервер покажет карточки сроков из данных хозяйства.',
      input_schema: {
        type: 'object',
        properties: {
          form_codes: { type: 'array', items: { type: 'string' }, description: 'Коды форм, если вопрос про конкретные формы (например "1-iso-r"); иначе не указывай.' },
        },
      },
    },
    {
      name: 'how_to',
      description: 'Вопрос «как проверить / подготовить / сдать отчёт». Сервер покажет памятку из трёх шагов.',
      input_schema: {
        type: 'object',
        properties: { title: { type: 'string', description: 'Заголовок памятки: «Как проверить отчет» или «Как подготовить отчет».' } },
      },
    },
  ];
}

const SYSTEM = `Ты — помощник приложения «АгроОкно» для фермеров и владельцев ЛПХ Республики Саха (Якутия). Отвечай по-русски, коротко и по делу, как в чате.

Что ты умеешь:
- записывать события со слов (надой, приплод, падёж, забой, продажа скота и продукции, корма) — инструмент propose_events;
- подсказывать сроки отчётов — инструмент report_status;
- объяснять, как проверить и подготовить отчёт — инструмент how_to;
- если данных не хватает — ask_clarification (один короткий вопрос).

Правила:
- Ты НИКОГДА не отправляешь отчёты и не меняешь данные на сервере: только предлагаешь события; отправку отчёта подтверждает пользователь сам.
- Не выдумывай количества, даты и животных. Если количества нет — задай вопрос.
- Приплод записывай в молодняк (корова → cattle_calves, кобыла → horses_young). Падёж/забой/продажа — в группу того животного, о котором речь.
- Один вызов инструмента на ответ. Если вопрос не по теме — ответь текстом одним-двумя предложениями и напомни, что умеешь.
- Всегда вызывай подходящий инструмент, если он применим.`;

function contextBlock(c: AssistantContext): string {
  const herd = c.herd.filter((h) => h.heads > 0).map((h) => `${h.label}: ${h.heads}`).join('; ') || 'нет данных';
  const deadlines =
    c.deadlines.map((d) => `${d.title} — срок ${d.due_on} (${d.days_left >= 0 ? `осталось ${d.days_left} дн.` : `просрочено на ${-d.days_left} дн.`})`).join('; ') ||
    'ближайших сроков нет';
  return [
    `Сегодня: ${c.today}`,
    `Пользователь: ${c.user_name ?? 'неизвестно'}`,
    `Хозяйство: ${c.farm ? `${c.farm.name} (${{ kfh: 'КФХ', ip: 'ИП', lph: 'ЛПХ' }[c.farm.legal_status]}), ${c.farm.settlement ?? ''}` : 'неизвестно'}`,
    `Поголовье: ${herd}`,
    `Сроки отчётов: ${deadlines}`,
  ].join('\n');
}

export interface ClaudeEngineOptions {
  apiKey: string;
  model: string;
  /** Подменяемый клиент для тестов. */
  client?: Pick<Anthropic, 'messages'>;
}

const supportsEffort = (model: string) => /^claude-(sonnet|opus|haiku)-5|^claude-(fable|mythos)/.test(model);

export function createClaudeEngine(options: ClaudeEngineOptions): AssistantEngine {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: 25_000 });
  const tools = buildTools();

  return {
    name: 'claude',
    async respond({ text, context, history }) {
      const messages: Anthropic.MessageParam[] = [];
      for (const h of history.slice(-10)) {
        const last = messages[messages.length - 1];
        if (last && last.role === h.role) last.content = `${last.content as string}\n${h.text}`;
        else messages.push({ role: h.role, content: h.text });
      }
      if (messages[0]?.role === 'assistant') messages.shift();
      const prev = messages[messages.length - 1];
      if (prev?.role === 'user') prev.content = `${prev.content as string}\n${text}`;
      else messages.push({ role: 'user', content: text });

      const response = await client.messages.create({
        model: options.model,
        max_tokens: 1500,
        system: `${SYSTEM}\n\nКонтекст хозяйства:\n${contextBlock(context)}`,
        tools,
        messages,
        ...(supportsEffort(options.model) ? { output_config: { effort: 'low' as const } } : {}),
      });
      if (response.stop_reason === 'refusal') throw new Error('Claude отказал в ответе (refusal)');
      return interpret(response.content, context, text);
    },
  };
}

/** Превращает ответ модели в EngineOutput; невалидные события отклоняются (бросают ошибку → запасной разбор). */
export function interpret(content: Anthropic.ContentBlock[], context: AssistantContext, userText: string): EngineOutput {
  const textBlock = content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const tool = content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!tool) {
    const t = textBlock?.text.trim();
    return { text: t || HELP_TEXT, proposed_events: [], needs_clarification: false };
  }
  const input = (tool.input ?? {}) as Record<string, unknown>;
  switch (tool.name) {
    case 'propose_events': {
      const rawEvents = Array.isArray(input.events) ? input.events : [];
      const units = Array.isArray(input.units) ? input.units : [];
      const events: NewEvent[] = [];
      rawEvents.forEach((raw, i) => {
        const loose = proposedEventSchema.safeParse(raw);
        const obj = (loose.success ? { ...loose.data } : { ...(raw as object) }) as Record<string, unknown>;
        const unit = (typeof obj.unit === 'string' ? obj.unit : (units[i] as string | null | undefined)) ?? null;
        delete obj.unit;
        if ((obj.type === 'product_output' || obj.type === 'product_sale') && obj.product === 'milk' && unit !== 'kg' && typeof obj.quantity === 'number') {
          obj.quantity = litersToKg(obj.quantity);
        }
        const parsed = safeParseNewEvent(obj);
        if (!parsed.ok) throw new Error(`Claude вернул невалидное событие: ${parsed.error}`);
        events.push(parsed.event);
      });
      if (events.length === 0) throw new Error('Claude не вернул событий');
      return { text: events.map(describeEvent).join('\n'), proposed_events: events, needs_clarification: false };
    }
    case 'ask_clarification': {
      const q = typeof input.question === 'string' && input.question.trim() ? input.question.trim() : 'Уточните, пожалуйста, количество. Пока ничего не сохранил.';
      return clarification(q);
    }
    case 'report_status': {
      const codes = Array.isArray(input.form_codes) ? input.form_codes.filter((c): c is string => typeof c === 'string') : undefined;
      return reportStatusAnswer(context, userText, codes);
    }
    case 'how_to':
      return howToAnswer(typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Как подготовить отчет');
    default:
      throw new Error(`Claude вызвал неизвестный инструмент ${tool.name}`);
  }
}

export type { HistoryItem };
