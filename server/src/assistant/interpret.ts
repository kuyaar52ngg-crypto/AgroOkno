// Провайдер-нейтральная часть LLM-помощника: описание инструментов, системный промпт, контекст хозяйства и разбор
// вызова инструмента в EngineOutput (литры → кг, zod-проверка NewEvent, ask_clarification, report_status, how_to).
// Модель только предлагает события и текст; сервер не пишет в БД. Невалидный ответ → ошибка → откат на правила.
import { z } from 'zod';

import { litersToKg } from '../../../app/src/reports/period';
import { clarification, describeEvent, HELP_TEXT, howToAnswer, reportStatusAnswer } from './answers';
import { safeParseNewEvent } from './schemas';
import type { AssistantContext, EngineOutput, NewEvent } from './types';

/** Инструмент в нейтральном виде (JSON Schema параметров); провайдер сам оборачивает в свой формат. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Вызов инструмента, разобранный из ответа модели (аргументы уже распарсены из JSON). */
export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** Ответ модели: вызов инструмента и/или обычный текст. */
export interface LlmResult {
  tool: ToolCall | null;
  text: string | null;
}

const GROUPS = [
  'cattle_cows', 'cattle_calves', 'cattle_other', 'pigs_sows', 'pigs_other', 'sheep', 'goats', 'horses_mares', 'horses_young',
  'horses_stallions', 'horses_other', 'deer', 'poultry', 'rabbits',
];
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

/**
 * Плоская схема события (надмножество полей NewEvent без anyOf/nullable/default): так её принимают все провайдеры,
 * включая бесплатные модели. Строгую проверку по типу NewEvent делает zod на сервере.
 */
function eventParameters(): Record<string, unknown> {
  return {
    type: 'object',
    description: 'Одно событие хозяйства. Поля, не относящиеся к типу события, не указывай.',
    properties: {
      type: { type: 'string', enum: ['livestock', 'product_output', 'product_sale', 'feed', 'crop'], description: 'livestock — движение скота; product_output — надой/сбор продукции; product_sale — продажа продукции; feed — корма; crop — растениеводство.' },
      occurred_on: str('Дата события YYYY-MM-DD; «сегодня» — текущая дата из контекста.'),
      note: str('Заметка (необязательно).'),
      animal_group: { type: 'string', enum: GROUPS, description: 'livestock: группа животных.' },
      kind: { type: 'string', enum: ['opening_balance', 'birth', 'purchase', 'transfer_in', 'sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out'], description: 'livestock: вид движения (birth — приплод, death — падёж, slaughter — забой, sale — продажа).' },
      heads: { type: 'integer', description: 'livestock: число голов (целое > 0).' },
      live_weight_kg: num('livestock: живая масса, кг (необязательно).'),
      amount_rub: num('livestock/product_sale: сумма, ₽ (необязательно).'),
      counterparty: str('livestock: покупатель/контрагент (необязательно).'),
      destination: str('livestock/product_sale: пункт назначения (необязательно).'),
      product: { type: 'string', enum: ['milk', 'eggs', 'wool', 'honey'], description: 'product_output/product_sale: вид продукции.' },
      quantity: num('product_output/product_sale: количество. Молоко — в литрах при unit="l" (сервер переведёт в кг); яйца — штуки (unit="pcs"); шерсть и мёд — кг (unit="kg").'),
      unit: { type: 'string', enum: ['l', 'kg', 'pcs'], description: 'Единица quantity для продукции: l — литры, kg — килограммы, pcs — штуки.' },
      source_group: { type: 'string', enum: GROUPS, description: 'product_output: от какой группы животных продукция (например, cattle_cows).' },
      buyer: str('product_sale: покупатель (необязательно).'),
      feed: { type: 'string', enum: ['hay', 'haylage', 'silage', 'grain', 'other'], description: 'feed: вид корма.' },
      operation: { type: 'string', enum: ['harvest', 'purchase', 'use', 'sowing'], description: 'feed: harvest/purchase/use; crop: sowing/harvest.' },
      quantity_t: num('feed: количество, тонны.'),
      storage_place: str('feed: место хранения (необязательно).'),
      plot_name: str('crop: название участка.'),
      crop: str('crop: культура.'),
      area_ha: num('crop: площадь, га.'),
      yield_t: num('crop: урожай, тонны (необязательно).'),
    },
    required: ['type', 'occurred_on'],
  };
}

export function buildToolDefs(): ToolDef[] {
  return [
    {
      name: 'propose_events',
      description:
        'Предложить события хозяйства для записи в журнал (сервер сам ничего не сохраняет — приложение сохранит после ответа). ' +
        'Используй, когда из фразы понятно, ЧТО и СКОЛЬКО произошло. Молоко: quantity — в литрах и unit="l" (сервер переведёт в кг); ' +
        'другая продукция: unit="kg" или "pcs" для яиц. Даты — YYYY-MM-DD, «сегодня» = текущая дата из контекста.',
      parameters: {
        type: 'object',
        properties: {
          reply: str('Короткий ответ пользователю по-русски: «Сохранил надой: 120 л за 23 октября».'),
          events: { type: 'array', minItems: 1, maxItems: 5, items: eventParameters() },
        },
        required: ['reply', 'events'],
      },
    },
    {
      name: 'ask_clarification',
      description:
        'Не хватает данных для записи (например, нет количества или не ясны животные). Задай ОДИН короткий уточняющий вопрос и сообщи, что пока ничего не сохранено.',
      parameters: {
        type: 'object',
        properties: { question: str('Вопрос по-русски, например: «Сколько литров молока получили сегодня? Пока ничего не сохранил.»') },
        required: ['question'],
      },
    },
    {
      name: 'report_status',
      description: 'Вопрос про ближайшие сроки сдачи отчётов или просрочки. Сервер покажет карточки сроков из данных хозяйства.',
      parameters: {
        type: 'object',
        properties: {
          form_codes: { type: 'array', items: { type: 'string' }, description: 'Коды форм, если вопрос про конкретные формы (например "1-iso-r"); иначе не указывай.' },
        },
      },
    },
    {
      name: 'how_to',
      description: 'Вопрос «как проверить / подготовить / сдать отчёт». Сервер покажет памятку из трёх шагов.',
      parameters: {
        type: 'object',
        properties: { title: str('Заголовок памятки: «Как проверить отчет» или «Как подготовить отчет».') },
      },
    },
  ];
}

export const SYSTEM = `Ты — помощник приложения «АгроОкно» для фермеров и владельцев ЛПХ Республики Саха (Якутия). Отвечай по-русски, коротко и по делу, как в чате.

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

export function contextBlock(c: AssistantContext): string {
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

export const systemPrompt = (context: AssistantContext): string => `${SYSTEM}\n\nКонтекст хозяйства:\n${contextBlock(context)}`;

const looseEvent = z.looseObject({ type: z.string(), unit: z.enum(['l', 'kg', 'pcs']).optional() });

/** Убирает пустые значения (null/«»), которые слабые модели подставляют в неиспользуемые поля. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

/** Превращает ответ модели в EngineOutput; невалидные события отклоняются (бросают ошибку → запасной разбор). */
export function interpret(result: LlmResult, context: AssistantContext, userText: string): EngineOutput {
  const tool = result.tool;
  if (!tool) {
    const t = result.text?.trim();
    return { text: t || HELP_TEXT, proposed_events: [], needs_clarification: false };
  }
  const input = tool.input;
  switch (tool.name) {
    case 'propose_events': {
      const rawEvents = Array.isArray(input.events) ? input.events : [];
      const units = Array.isArray(input.units) ? input.units : [];
      const events: NewEvent[] = [];
      rawEvents.forEach((raw, i) => {
        if (typeof raw !== 'object' || raw === null) throw new Error('Модель вернула невалидное событие: ожидался объект');
        const loose = looseEvent.safeParse(compact(raw as Record<string, unknown>));
        const obj = (loose.success ? { ...loose.data } : { ...compact(raw as Record<string, unknown>) }) as Record<string, unknown>;
        const unit = (typeof obj.unit === 'string' ? obj.unit : (units[i] as string | null | undefined)) ?? null;
        delete obj.unit;
        // Для молока модель указывает литры + unit = "l": пересчёт в кг (1 л = 1,03 кг) делает сервер.
        if ((obj.type === 'product_output' || obj.type === 'product_sale') && obj.product === 'milk' && unit !== 'kg' && typeof obj.quantity === 'number') {
          obj.quantity = litersToKg(obj.quantity);
        }
        const parsed = safeParseNewEvent(obj);
        if (!parsed.ok) throw new Error(`Модель вернула невалидное событие: ${parsed.error}`);
        events.push(parsed.event);
      });
      if (events.length === 0) throw new Error('Модель не вернула событий');
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
      throw new Error(`Модель вызвала неизвестный инструмент ${tool.name}`);
  }
}
