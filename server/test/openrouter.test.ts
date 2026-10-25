// Движок OpenRouter: разбор tool_calls, проверка запроса (models, tools в формате OpenAI, system первым сообщением),
// пересчёт литров, откат на правила при ошибках; кеш настройки модели и каталог моделей.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildToolDefs, interpret, type LlmResult } from '../src/assistant/interpret';
import { createModelCatalog, createModelSettingsStore, parseSettings, toModelOptions } from '../src/assistant/models';
import { buildMessages, createOpenRouterEngine, modelList, parseCompletion } from '../src/assistant/openrouter';
import { rulesEngine } from '../src/assistant/rules';
import { createAssistantService } from '../src/assistant/service';
import { parseEnv } from '../src/env';
import { litersToKg } from '../../app/src/reports/period';
import { FakeDb, RpcError } from './helpers/fakeSupabase';
import { demoContext, TODAY } from './helpers/fixtures';

const ctx = demoContext();
const tool = (name: string, input: Record<string, unknown>): LlmResult => ({ tool: { name, input }, text: null });

/** Ответ OpenRouter с одним вызовом инструмента (arguments — JSON-строка, как в OpenAI-формате). */
const completion = (name: string, args: unknown, model = 'anthropic/claude-haiku-5.5') => ({
  model,
  choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

interface Seen {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

const fakeFetch = (respond: unknown | (() => Response), seen: Seen[] = []): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? '{}')) });
    if (typeof respond === 'function') return (respond as () => Response)();
    return new Response(JSON.stringify(respond), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

const jsonResponse = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const engineWith = (fetchImpl: typeof fetch, extra: { timeoutMs?: number } = {}) =>
  createOpenRouterEngine({ apiKey: 'sk-or-test', defaultModel: 'anthropic/claude-haiku-5.5', fetchImpl, ...extra });

describe('interpret (вызов инструмента → EngineOutput)', () => {
  it('propose_events: надой в литрах → кг (1 л = 1,03 кг)', () => {
    const out = interpret(
      tool('propose_events', {
        reply: 'Сохранил надой',
        events: [{ type: 'product_output', occurred_on: TODAY, product: 'milk', quantity: 120, unit: 'l', source_group: 'cattle_cows' }],
      }),
      ctx,
      'надой 120 л',
    );
    const e = out.proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.quantity === litersToKg(120) && e.note === null);
    assert.equal(out.text, 'Сохранил надой: 120 л за 23 октября');
    assert.equal(out.needs_clarification, false);
  });

  it('propose_events: старый формат с массивом units тоже понимается; молоко в кг не пересчитывается', () => {
    const legacy = interpret(
      tool('propose_events', { reply: '', events: [{ type: 'product_output', occurred_on: TODAY, product: 'milk', quantity: 120 }], units: ['l'] }),
      ctx,
      '',
    );
    assert.ok(legacy.proposed_events[0]!.type === 'product_output' && legacy.proposed_events[0]!.quantity === litersToKg(120));
    const kg = interpret(tool('propose_events', { reply: '', events: [{ type: 'product_output', occurred_on: TODAY, product: 'milk', quantity: 50, unit: 'kg' }] }), ctx, '');
    assert.ok(kg.proposed_events[0]!.type === 'product_output' && kg.proposed_events[0]!.quantity === 50);
  });

  it('propose_events: пустые поля (null, «») от слабых моделей не мешают, событие приходит по типу NewEvent', () => {
    const out = interpret(
      tool('propose_events', {
        reply: '',
        events: [{ type: 'livestock', occurred_on: TODAY, animal_group: 'horses_young', kind: 'birth', heads: 2, note: '', counterparty: null, amount_rub: null }],
      }),
      ctx,
      'родилось два жеребёнка',
    );
    const e = out.proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.heads === 2 && e.note === null && e.counterparty === null && e.mercury_status === 'not_required');
  });

  it('propose_events: невалидное событие отклоняется', () => {
    const bad = (event: Record<string, unknown>) => () => interpret(tool('propose_events', { reply: '', events: [event] }), ctx, '');
    assert.throws(bad({ type: 'livestock', occurred_on: TODAY, animal_group: 'dragon', kind: 'birth', heads: 1 }));
    assert.throws(bad({ type: 'livestock', occurred_on: 'сегодня', animal_group: 'sheep', kind: 'birth', heads: 1 }));
    assert.throws(bad({ type: 'livestock', occurred_on: TODAY, animal_group: 'sheep', kind: 'birth', heads: -2 }));
    assert.throws(() => interpret(tool('propose_events', { reply: '', events: [] }), ctx, ''), /не вернула событий/);
    assert.throws(() => interpret(tool('propose_events', { reply: '', events: ['строка'] }), ctx, ''));
  });

  it('ask_clarification (J5)', () => {
    const out = interpret(tool('ask_clarification', { question: 'Сколько литров? Пока ничего не сохранил.' }), ctx, '');
    assert.equal(out.needs_clarification, true);
    assert.equal(out.proposed_events.length, 0);
  });

  it('report_status и how_to строят карточки на сервере (J6)', () => {
    const status = interpret(tool('report_status', {}), ctx, 'Какие отчеты скоро сдавать?');
    assert.ok((status.cards ?? []).some((c) => c.kind === 'deadline'));
    const filtered = interpret(tool('report_status', { form_codes: ['1-iso-r'] }), ctx, '');
    assert.equal((filtered.cards ?? []).filter((c) => c.kind === 'deadline').length, 1);
    const howTo = interpret(tool('how_to', { title: 'Как проверить отчет' }), ctx, '');
    assert.equal(howTo.cards?.[0]?.kind, 'how_to');
  });

  it('текст без инструмента → обычный ответ; неизвестный инструмент → ошибка', () => {
    const out = interpret({ tool: null, text: 'Я помогаю с отчетами.' }, ctx, '');
    assert.equal(out.text, 'Я помогаю с отчетами.');
    assert.throws(() => interpret(tool('format_disk', {}), ctx, ''), /неизвестный инструмент/);
  });
});

describe('разбор ответа OpenRouter', () => {
  it('берёт tool_calls[0] и парсит arguments из JSON-строки', () => {
    const r = parseCompletion(completion('how_to', { title: 'Как проверить отчет' }));
    assert.deepEqual(r.tool, { name: 'how_to', input: { title: 'Как проверить отчет' } });
  });

  it('невалидный JSON, ответ с error, пустые choices и пустой текст → ошибка', () => {
    const broken = completion('propose_events', {});
    broken.choices[0]!.message.tool_calls![0]!.function.arguments = '{"reply": "нет закрывающей скобки';
    assert.throws(() => parseCompletion(broken), /невалидный JSON/);
    assert.throws(() => parseCompletion({ error: { message: 'No endpoints found', code: 404 } }), /No endpoints found/);
    assert.throws(() => parseCompletion({ choices: [] }), /choices пуст/);
    assert.throws(() => parseCompletion({ choices: [{ message: { content: '  ' } }] }), /пустой ответ/);
    assert.throws(() => parseCompletion(completion('how_to', ['не', 'объект']) as never), /объектом/);
  });

  it('обычный текстовый ответ без tool_calls допустим', () => {
    assert.deepEqual(parseCompletion({ choices: [{ message: { content: 'Привет!' } }] }), { tool: null, text: 'Привет!' });
  });
});

describe('движок OpenRouter: запрос', () => {
  it('POST /chat/completions: models, tools в формате OpenAI, system первым сообщением, заголовки', async () => {
    const seen: Seen[] = [];
    const engine = engineWith(fakeFetch(completion('report_status', {}, 'google/gemma-4-31b-it:free'), seen));
    const out = await engine.respond({
      text: 'Какие отчеты скоро сдавать?',
      context: ctx,
      history: [{ role: 'assistant', text: 'Привет' }, { role: 'user', text: 'Привет' }],
      models: { model: 'anthropic/claude-haiku-5.5', fallbacks: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free'] },
    });
    const req = seen[0]!;
    assert.equal(req.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(req.init.method, 'POST');
    const headers = req.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer sk-or-test');
    assert.match(headers['HTTP-Referer']!, /^https:\/\//);
    assert.equal(headers['X-Title'], 'AgroOkno');
    assert.ok(req.init.signal instanceof AbortSignal);

    assert.deepEqual(req.body.models, ['anthropic/claude-haiku-5.5', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free']);
    const tools = req.body.tools as { type: string; function: { name: string; description: string; parameters: { type: string } } }[];
    assert.equal(tools.map((t) => t.function.name).join(), 'propose_events,ask_clarification,report_status,how_to');
    assert.ok(tools.every((t) => t.type === 'function' && t.function.description.length > 10 && t.function.parameters.type === 'object'));
    const messages = req.body.messages as { role: string; content: string }[];
    assert.equal(messages[0]!.role, 'system');
    assert.match(messages[0]!.content, /ЛПХ Ивановых/);
    assert.match(messages[0]!.content, /1-ИСО-р/);
    assert.equal(messages[1]!.role, 'user'); // ведущее сообщение ассистента отброшено
    assert.equal(messages[messages.length - 1]!.role, 'user');
    assert.ok(messages.slice(1).every((m, i, a) => i === 0 || m.role !== a[i - 1]!.role), 'роли чередуются');
    assert.equal(req.body.model, undefined);

    assert.equal(out.model_used, 'google/gemma-4-31b-it:free', 'model_used — модель из ответа OpenRouter (сработал запасной вариант)');
    assert.ok((out.cards ?? []).some((c) => c.kind === 'deadline'));
  });

  it('без настройки из БД берёт модель по умолчанию (env); model_used при отсутствии поля model — первая из списка', async () => {
    const seen: Seen[] = [];
    const body = completion('how_to', {});
    delete (body as { model?: string }).model;
    const out = await engineWith(fakeFetch(body, seen)).respond({ text: 'Как проверить отчет', context: ctx, history: [] });
    assert.deepEqual(seen[0]!.body.models, ['anthropic/claude-haiku-5.5']);
    assert.equal(out.model_used, 'anthropic/claude-haiku-5.5');
  });

  it('инструменты сериализуются в JSON без anyOf/nullable (совместимо с бесплатными моделями)', () => {
    const json = JSON.stringify(buildToolDefs());
    assert.ok(!/anyOf|oneOf|"nullable"|"default"/.test(json));
    const events = (buildToolDefs()[0]!.parameters as { properties: { events: { items: { properties: Record<string, unknown> } } } }).properties.events.items.properties;
    for (const field of ['type', 'occurred_on', 'animal_group', 'kind', 'heads', 'product', 'quantity', 'unit', 'feed', 'plot_name']) assert.ok(field in events, field);
  });

  it('склейка истории и список моделей без повторов', () => {
    const msgs = buildMessages('sys', [{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'assistant', text: 'c' }], 'd');
    assert.deepEqual(msgs, [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ]);
    assert.deepEqual(modelList({ model: 'a/b', fallbacks: ['c/d', 'a/b', ' '] }), ['a/b', 'c/d']);
  });
});

describe('движок OpenRouter: ошибки → правила', () => {
  const run = async (fetchImpl: typeof fetch, text = 'Какие отчеты скоро сдавать?', extra: { timeoutMs?: number } = {}) => {
    const logs: unknown[] = [];
    const service = createAssistantService(engineWith(fetchImpl, extra), { warn: (o) => logs.push(o) });
    const res = await service.respond({ text, context: ctx, history: [] });
    return { res, logs };
  };

  it('HTTP 500 / 429 / 402 → ответ строится правилами, в лог попадает причина', async () => {
    for (const status of [500, 429, 402]) {
      const { res, logs } = await run(fakeFetch(jsonResponse({ error: { message: 'upstream error', code: status } }, status)));
      assert.equal(res.engine_used, 'rules', String(status));
      assert.equal(res.model_used, undefined);
      assert.ok((res.reply.cards ?? []).length > 0);
      assert.match(String((logs[0] as { err: string }).err), new RegExp(`OpenRouter ${status}`));
    }
  });

  it('ответ 200 с телом error (все модели отказали) → правила', async () => {
    const { res } = await run(fakeFetch(jsonResponse({ error: { message: 'All providers failed', code: 502 } })));
    assert.equal(res.engine_used, 'rules');
  });

  it('невалидный JSON в arguments → правила; событие по правилам всё равно предлагается', async () => {
    const broken = completion('propose_events', {});
    broken.choices[0]!.message.tool_calls![0]!.function.arguments = '{не json';
    const { res } = await run(fakeFetch(jsonResponse(broken)), 'Сегодня коровы дали 120 литров молока');
    assert.equal(res.engine_used, 'rules');
    assert.equal(res.proposed_events.length, 1);
  });

  it('невалидное событие от модели (zod) и неизвестный инструмент → правила', async () => {
    const badEvent = completion('propose_events', { reply: '', events: [{ type: 'livestock', occurred_on: TODAY, animal_group: 'dragon', kind: 'birth', heads: 1 }] });
    assert.equal((await run(fakeFetch(jsonResponse(badEvent)))).res.engine_used, 'rules');
    assert.equal((await run(fakeFetch(jsonResponse(completion('format_disk', {}))))).res.engine_used, 'rules');
  });

  it('сеть недоступна и таймаут 25 с (AbortSignal) → правила', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    assert.equal((await run(down)).res.engine_used, 'rules');

    // таймер AbortSignal.timeout не держит цикл событий (unref), поэтому «зависший» fetch держит его сам
    const hangs = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('таймаут запроса не сработал')), 5000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(init.signal!.reason);
        });
      })) as unknown as typeof fetch;
    const started = Date.now();
    const { res } = await run(hangs, 'Какие отчеты скоро сдавать?', { timeoutMs: 30 });
    assert.equal(res.engine_used, 'rules');
    assert.ok(Date.now() - started < 2000);
  });

  it('успешный ответ LLM: engine_used = openrouter и model_used', async () => {
    const { res } = await run(fakeFetch(completion('how_to', { title: 'Как проверить отчет' }, 'anthropic/claude-haiku-5.5')), 'Как проверить отчет?');
    assert.equal(res.engine_used, 'openrouter');
    assert.equal(res.model_used, 'anthropic/claude-haiku-5.5');
    assert.equal(res.reply.cards?.[0]?.kind, 'how_to');
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

describe('настройка модели: RPC get_assistant_model_settings, кеш 30 с, запасной вариант env', () => {
  const rpcRow = { model: 'anthropic/claude-haiku-5.5', fallback_models: ['google/gemma-4-31b-it:free'], updated_at: '2026-10-25T00:00:00Z', updated_by: 'kuyaar52ngg@gmail.com' };

  it('читает из БД, кеширует на 30 с и перечитывает после истечения', async () => {
    let time = 1_000_000;
    const db = new FakeDb();
    let calls = 0;
    db.rpcs.get_assistant_model_settings = () => {
      calls += 1;
      return calls === 1 ? rpcRow : { ...rpcRow, model: 'google/gemma-4-31b-it:free', fallback_models: [] };
    };
    const store = createModelSettingsStore({ defaultModel: 'env/model', clock: () => time });
    assert.deepEqual(store.peek(), { model: 'env/model', fallbacks: [], source: 'env' });

    const first = await store.get(db.client());
    assert.deepEqual(first, { model: 'anthropic/claude-haiku-5.5', fallbacks: ['google/gemma-4-31b-it:free'], source: 'db' });
    time += 29_000;
    assert.equal((await store.get(db.client())).model, 'anthropic/claude-haiku-5.5');
    assert.equal(calls, 1, 'в пределах 30 с запрос к БД не повторяется');
    time += 2_000;
    assert.equal((await store.get(db.client())).model, 'google/gemma-4-31b-it:free');
    assert.equal(calls, 2);
  });

  it('ошибка БД → OPENROUTER_MODEL; повторная попытка через 10 с; set() подменяет значение сразу', async () => {
    let time = 0;
    const db = new FakeDb();
    let broken = true;
    db.rpcs.get_assistant_model_settings = () => {
      if (broken) throw new RpcError('PGRST202', 'function not found');
      return rpcRow;
    };
    const store = createModelSettingsStore({ defaultModel: 'env/model', clock: () => time });
    assert.deepEqual(await store.get(db.client()), { model: 'env/model', fallbacks: [], source: 'env' });
    broken = false;
    time += 5_000;
    assert.equal((await store.get(db.client())).source, 'env', 'неудача кешируется на короткое время');
    time += 6_000;
    assert.equal((await store.get(db.client())).source, 'db');

    store.set({ model: 'x/y', fallback_models: ['a/b'] });
    assert.deepEqual(await store.get(db.client()), { model: 'x/y', fallbacks: ['a/b'], source: 'db' });
    store.set();
    assert.equal(store.peek().model, 'x/y', 'peek отдаёт последнее известное значение');
    assert.equal((await store.get(db.client())).model, 'anthropic/claude-haiku-5.5', 'после set() без аргумента значение перечитывается из БД');
  });

  it('без клиента БД отдаёт кеш или env; одновременные запросы делят один вызов RPC', async () => {
    const store = createModelSettingsStore({ defaultModel: 'env/model' });
    assert.equal((await store.get(null)).model, 'env/model');
    const db = new FakeDb();
    let calls = 0;
    db.rpcs.get_assistant_model_settings = () => {
      calls += 1;
      return rpcRow;
    };
    await Promise.all([store.get(db.client()), store.get(db.client()), store.get(db.client())]);
    assert.equal(calls, 1);
  });

  it('parseSettings: пустой/кривой ответ → null', () => {
    assert.equal(parseSettings(null), null);
    assert.equal(parseSettings({ model: '' }), null);
    assert.deepEqual(parseSettings({ model: 'a/b' }), { model: 'a/b', fallback_models: [], updated_at: null, updated_by: null });
  });
});

describe('каталог моделей OpenRouter', () => {
  const models = [
    { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', context_length: 1_000_000, pricing: { prompt: '0.0000001', completion: '0.0000005' }, supported_parameters: ['tools', 'max_tokens'] },
    { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'vendor/zero-price', name: 'Vendor: Zero', context_length: null, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'vendor/half-free', name: 'Vendor: Half', pricing: { prompt: '0', completion: '0.000001' }, supported_parameters: ['tools'] },
    { id: 'meta/no-tools', name: 'No tools', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] },
    { id: 'router/auto', name: 'Auto', pricing: { prompt: '-1', completion: '-1' }, supported_parameters: ['tools'] },
  ];

  it('оставляет только модели с tools; free = :free или нулевая цена prompt и completion', () => {
    const options = toModelOptions(models);
    assert.deepEqual(Object.fromEntries(options.map((o) => [o.id, o.free])), {
      'anthropic/claude-haiku-5.5': false,
      'google/gemma-4-31b-it:free': true,
      'vendor/zero-price': true,
      'vendor/half-free': false,
      'router/auto': false, // цена -1 (маршрутизатор) — не бесплатная
    });
    assert.ok(!options.some((o) => o.id === 'meta/no-tools'));
    const names = options.map((o) => o.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), 'отсортировано по названию');
    assert.equal(options.find((o) => o.id === 'vendor/zero-price')!.context_length, null);
    assert.equal(options.find((o) => o.id === 'google/gemma-4-31b-it:free')!.context_length, 262144);
  });

  it('кеш 10 минут; при сбое после истечения отдаётся устаревший список; без кеша — ошибка', async () => {
    let time = 0;
    let calls = 0;
    let fail = false;
    const fetchImpl = (async (url: string | URL | Request) => {
      calls += 1;
      assert.equal(String(url), 'https://openrouter.ai/api/v1/models');
      if (fail) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ data: models }), { status: 200 });
    }) as typeof fetch;
    const catalog = createModelCatalog({ fetchImpl, clock: () => time });
    assert.equal((await catalog.list()).length, 5);
    time += 9 * 60_000;
    await catalog.list();
    assert.equal(calls, 1);
    time += 2 * 60_000;
    fail = true;
    assert.equal((await catalog.list()).length, 5, 'устаревший кеш вместо ошибки');
    assert.equal(calls, 2);

    const empty = createModelCatalog({ fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch });
    await assert.rejects(() => empty.list(), /OpenRouter/);
  });
});

describe('конфигурация OpenRouter (env)', () => {
  const BASE = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key' };

  it('значения по умолчанию; пустой ключ игнорируется; ANTHROPIC_* больше не читаются', () => {
    const env = parseEnv({ ...BASE, OPENROUTER_API_KEY: '  ', ANTHROPIC_API_KEY: 'sk-ant-old' });
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.OPENROUTER_MODEL, 'anthropic/claude-haiku-5.5');
    assert.equal(env.OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1');
    assert.ok(!('ANTHROPIC_API_KEY' in env));
    assert.equal(parseEnv({ ...BASE, OPENROUTER_API_KEY: 'sk-or-1', OPENROUTER_MODEL: 'google/gemma-4-31b-it:free' }).OPENROUTER_MODEL, 'google/gemma-4-31b-it:free');
    assert.throws(() => parseEnv({ ...BASE, OPENROUTER_BASE_URL: 'нет' }), /OPENROUTER_BASE_URL/);
  });
});
