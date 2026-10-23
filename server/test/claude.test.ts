// Движок на Claude: разбор tool_use, валидация zod, пересчёт литров, запасной разбор по правилам.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type Anthropic from '@anthropic-ai/sdk';

import { createClaudeEngine, interpret } from '../src/assistant/claude';
import { rulesEngine } from '../src/assistant/rules';
import { createAssistantService } from '../src/assistant/service';
import { litersToKg } from '../../app/src/reports/period';
import { demoContext, TODAY } from './helpers/fixtures';

const ctx = demoContext();
const toolUse = (name: string, input: unknown): Anthropic.ContentBlock[] =>
  [{ type: 'tool_use', id: 'toolu_1', name, input, caller: { type: 'direct' } }] as unknown as Anthropic.ContentBlock[];

const fakeClient = (content: Anthropic.ContentBlock[], stop_reason = 'tool_use', seen: unknown[] = []) =>
  ({
    messages: {
      create: async (params: unknown) => {
        seen.push(params);
        return { content, stop_reason };
      },
    },
  }) as unknown as Pick<Anthropic, 'messages'>;

describe('interpret (tool use → EngineOutput)', () => {
  it('propose_events: надой в литрах → кг (1 л = 1,03 кг)', () => {
    const out = interpret(
      toolUse('propose_events', {
        reply: 'Сохранил надой',
        events: [{ type: 'product_output', occurred_on: TODAY, product: 'milk', quantity: 120, source_group: 'cattle_cows' }],
        units: ['l'],
      }),
      ctx,
      'надой 120 л',
    );
    const e = out.proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.quantity === litersToKg(120) && e.note === null);
    assert.equal(out.text, 'Сохранил надой: 120 л за 23 октября');
    assert.equal(out.needs_clarification, false);
  });

  it('propose_events: молоко в кг не пересчитывается', () => {
    const out = interpret(
      toolUse('propose_events', { reply: '', events: [{ type: 'product_output', occurred_on: TODAY, product: 'milk', quantity: 50 }], units: ['kg'] }),
      ctx,
      '',
    );
    const e = out.proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.quantity === 50);
  });

  it('propose_events: невалидное событие отклоняется', () => {
    assert.throws(() =>
      interpret(toolUse('propose_events', { reply: '', events: [{ type: 'livestock', occurred_on: TODAY, animal_group: 'dragon', kind: 'birth', heads: 1 }] }), ctx, ''),
    );
    assert.throws(() =>
      interpret(toolUse('propose_events', { reply: '', events: [{ type: 'livestock', occurred_on: 'сегодня', animal_group: 'sheep', kind: 'birth', heads: 1 }] }), ctx, ''),
    );
    assert.throws(() =>
      interpret(toolUse('propose_events', { reply: '', events: [{ type: 'livestock', occurred_on: TODAY, animal_group: 'sheep', kind: 'birth', heads: -2 }] }), ctx, ''),
    );
  });

  it('ask_clarification (J5)', () => {
    const out = interpret(toolUse('ask_clarification', { question: 'Сколько литров? Пока ничего не сохранил.' }), ctx, '');
    assert.equal(out.needs_clarification, true);
    assert.equal(out.proposed_events.length, 0);
  });

  it('report_status и how_to строят карточки на сервере (J6)', () => {
    const status = interpret(toolUse('report_status', {}), ctx, 'Какие отчеты скоро сдавать?');
    assert.ok((status.cards ?? []).some((c) => c.kind === 'deadline'));
    const filtered = interpret(toolUse('report_status', { form_codes: ['1-iso-r'] }), ctx, '');
    assert.deepEqual((filtered.cards ?? []).filter((c) => c.kind === 'deadline').length, 1);
    const howTo = interpret(toolUse('how_to', { title: 'Как проверить отчет' }), ctx, '');
    assert.equal(howTo.cards?.[0]?.kind, 'how_to');
  });

  it('текст без инструмента → обычный ответ; неизвестный инструмент → ошибка', () => {
    const out = interpret([{ type: 'text', text: 'Я помогаю с отчетами.', citations: null }] as unknown as Anthropic.ContentBlock[], ctx, '');
    assert.equal(out.text, 'Я помогаю с отчетами.');
    assert.throws(() => interpret(toolUse('format_disk', {}), ctx, ''));
  });
});

describe('движок Claude и запасной вариант', () => {
  it('запрос к API содержит инструменты, контекст и не содержит thinking/temperature', async () => {
    const seen: Record<string, unknown>[] = [];
    const engine = createClaudeEngine({
      apiKey: 'test',
      model: 'claude-sonnet-5-5',
      client: fakeClient(toolUse('report_status', {}), 'tool_use', seen),
    });
    await engine.respond({ text: 'Какие отчеты скоро сдавать?', context: ctx, history: [{ role: 'assistant', text: 'Привет' }, { role: 'user', text: 'Привет' }] });
    const req = seen[0]!;
    assert.equal(req.model, 'claude-sonnet-5-5');
    assert.ok(Array.isArray(req.tools) && (req.tools as { name: string }[]).map((t) => t.name).join() === 'propose_events,ask_clarification,report_status,how_to');
    assert.match(String(req.system), /ЛПХ Ивановых/);
    assert.match(String(req.system), /1-ИСО-р/);
    assert.equal(req.temperature, undefined);
    assert.equal(req.thinking, undefined);
    assert.equal(req.tool_choice, undefined);
    const msgs = req.messages as { role: string }[];
    assert.equal(msgs[0]!.role, 'user');
    assert.equal(msgs[msgs.length - 1]!.role, 'user');
  });

  it('refusal → ошибка → сервис переключается на правила', async () => {
    const logs: unknown[] = [];
    const engine = createClaudeEngine({ apiKey: 'x', model: 'claude-sonnet-5-5', client: fakeClient([], 'refusal') });
    const service = createAssistantService(engine, { warn: (o) => logs.push(o) });
    const res = await service.respond({ text: 'Сегодня коровы дали 120 литров молока', context: ctx, history: [] });
    assert.equal(res.engine_used, 'rules');
    assert.equal(res.proposed_events.length, 1);
    assert.equal(res.reply.role, 'assistant');
    assert.equal(logs.length, 1);
  });

  it('исключение API → запасной разбор', async () => {
    const client = { messages: { create: async () => { throw new Error('529 overloaded'); } } } as unknown as Pick<Anthropic, 'messages'>;
    const service = createAssistantService(createClaudeEngine({ apiKey: 'x', model: 'claude-sonnet-5-5', client }), { warn() {} });
    const res = await service.respond({ text: 'Какие отчеты скоро сдавать?', context: ctx, history: [] });
    assert.equal(res.engine_used, 'rules');
    assert.ok((res.reply.cards ?? []).length > 0);
  });

  it('без ключа работает правиловый движок и формат ответа тот же', async () => {
    const service = createAssistantService(rulesEngine, { warn() {} });
    const res = await service.respond({ text: 'Запиши надой за сегодня', context: ctx, history: [] });
    assert.equal(res.engine_used, 'rules');
    assert.equal(res.needs_clarification, true);
    assert.match(res.reply.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(res.reply.created_at)));
  });
});
