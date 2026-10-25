// HTTP-слой: авторизация, помощник, голос (multipart), настройки напоминаний, запуск по CRON_SECRET, адаптер отчётов.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app';
import { createModelCatalog, createModelSettingsStore } from '../src/assistant/models';
import { createAssistantService } from '../src/assistant/service';
import { rulesEngine } from '../src/assistant/rules';
import type { Deps } from '../src/deps';
import { parseEnv } from '../src/env';
import { createSttProvider } from '../src/stt';
import type { SttProvider } from '../src/stt';
import { SttFormatError } from '../src/stt';
import { FARM_ID, seedFarm, USER_ID } from './helpers/fixtures';

const env = parseEnv({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CRON_SECRET: 'cron-secret-123',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  CRON_ENABLED: 'false',
});

const db = seedFarm();
const TOKEN = 'user-token';

function makeDeps(stt: SttProvider = createSttProvider(env)): Deps {
  return {
    env,
    supabase: {
      verify: async (t) => (t === TOKEN ? { id: USER_ID, email: null } : null),
      forUser: () => db.client(),
      service: () => db.client(),
    },
    assistant: createAssistantService(rulesEngine, { warn() {} }, () => new Date('2026-10-23T05:00:00Z')),
    modelSettings: createModelSettingsStore({ defaultModel: env.OPENROUTER_MODEL }),
    modelCatalog: createModelCatalog({ fetchImpl: (async () => new Response('{}', { status: 503 })) as typeof fetch }),
    stt,
    push: { send: async () => [] },
    clock: () => new Date('2026-10-23T05:00:00Z'),
  };
}

const auth = { authorization: `Bearer ${TOKEN}` };

function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
  const boundary = '----agrotest';
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('HTTP API', () => {
  let app: FastifyInstance;
  before(async () => {
    app = await buildApp(makeDeps());
  });
  after(async () => {
    await app.close();
  });

  it('GET /health — провайдеры', async () => {
    const res = await app.inject('/health');
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.deepEqual([body.providers.llm, body.providers.stt], ['rules', 'mock']);
    assert.equal(body.model, null, 'без ключа OpenRouter модель не используется');
  });

  it('GET /docs/json — OpenAPI с маршрутами /v1', async () => {
    const res = await app.inject('/docs/json');
    assert.equal(res.statusCode, 200);
    const paths = Object.keys(res.json().paths);
    for (const p of [
      '/v1/assistant/messages', '/v1/assistant/transcribe', '/v1/reminders/run', '/v1/push-tokens', '/v1/farms/lookup', '/v1/farms/join-requests',
      '/v1/reports/3-fermer', '/v1/horriot/sync', '/v1/admin/me', '/v1/admin/assistant-settings', '/v1/admin/models',
    ]) {
      assert.ok(paths.includes(p), `нет ${p}`);
    }
  });

  it('помощник: без токена 401, с неверным токеном 401, с неверным телом 400', async () => {
    const payload = { farm_id: FARM_ID, text: 'привет' };
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/messages', payload })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/messages', payload, headers: { authorization: 'Bearer bad' } })).statusCode, 401);
    const bad = await app.inject({ method: 'POST', url: '/v1/assistant/messages', payload: { text: '' }, headers: auth });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().code, 'validation');
  });

  it('помощник: надой → { reply, proposed_events, needs_clarification }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/assistant/messages',
      headers: auth,
      payload: { farm_id: FARM_ID, text: 'Сегодня коровы дали 120 литров молока', history: [{ role: 'assistant', text: 'Здравствуйте' }] },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.needs_clarification, false);
    assert.equal(body.proposed_events[0].type, 'product_output');
    assert.equal(body.proposed_events[0].quantity, 123.6);
    assert.equal(body.reply.role, 'assistant');
    assert.equal(body.reply.text, 'Сохранил надой: 120 л за 23 октября');
    assert.equal(db.rows('product_outputs').length > 0, true);
    // сервер ничего не пишет
    assert.equal(db.calls.filter((c) => c.op !== 'select' && c.op !== 'rpc').length, 0);
    assert.equal(body.engine, 'rules');
    assert.equal(body.model_used, undefined, 'model_used только если отвечала LLM');
  });

  it('помощник: чужое/несуществующее хозяйство → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/assistant/messages',
      headers: auth,
      payload: { farm_id: 'f0000000-0000-4000-8000-0000000000ff', text: 'привет' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('голос: mock → 503 «напишите текстом»', async () => {
    const m = multipart({ duration_ms: '5000' }, { name: 'voice.m4a', type: 'audio/m4a', data: Buffer.alloc(2048, 1) });
    const res = await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...m });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, 'stt_unavailable');
    assert.match(res.json().error, /Распознавание речи не настроено — напишите текстом/);
  });

  it('голос: лимиты — длительность, размер, MIME, пустой запрос', async () => {
    const long = multipart({ duration_ms: '61000' }, { name: 'v.m4a', type: 'audio/m4a', data: Buffer.alloc(100, 1) });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...long })).statusCode, 413);
    const big = multipart({}, { name: 'v.m4a', type: 'audio/m4a', data: Buffer.alloc(5 * 1024 * 1024 + 1024, 1) });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...big })).statusCode, 413);
    const wrongType = multipart({}, { name: 'v.txt', type: 'text/plain', data: Buffer.alloc(100, 1) });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...wrongType })).statusCode, 415);
    const none = multipart({ duration_ms: '1000' });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...none })).statusCode, 400);
    const json = await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', headers: auth, payload: { a: 1 } });
    assert.equal(json.statusCode, 400);
  });

  it('напоминания: настройки по умолчанию и PUT', async () => {
    const get = await app.inject({ url: '/v1/reminders/settings', headers: auth });
    assert.equal(get.statusCode, 200);
    assert.deepEqual(get.json(), { push_enabled: true, sound: false, deadline_reminders: true, reminders_in_chat: true, remind_7_days: true, remind_1_day: true });
    const bad = await app.inject({ method: 'PUT', url: '/v1/reminders/settings', headers: auth, payload: { remind_7_days: 'нет' } });
    assert.equal(bad.statusCode, 400);
  });

  it('запуск напоминаний: только с CRON_SECRET', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/reminders/run' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/reminders/run', headers: { authorization: 'Bearer wrong' } })).statusCode, 401);
    const ok = await app.inject({ method: 'POST', url: '/v1/reminders/run?dry_run=true', headers: { authorization: 'Bearer cron-secret-123' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().farms, 1);
    assert.ok(ok.json().notifications > 0);
    assert.equal(db.rows('notifications').length, 0, 'dry_run ничего не пишет');
  });

  it('адаптер отчётов: токен проверяется, параметры валидируются обработчиком app/api', async () => {
    const noAuth = await app.inject(`/v1/reports/3-fermer?farm_id=${FARM_ID}&year=2026`);
    assert.equal(noAuth.statusCode, 401);
    const badYear = await app.inject({ url: `/api/reports/3-fermer?farm_id=${FARM_ID}&year=abc`, headers: auth });
    assert.equal(badYear.statusCode, 400);
    assert.match(badYear.json().error, /год/);
    const badReceipt = await app.inject({ url: '/v1/receipts/bad', headers: auth });
    assert.equal(badReceipt.statusCode, 400);
  });

  it('Хорриот: POST /v1/horriot/sync и /api/horriot/sync — токен и farm_id проверяются обработчиком app/api', async () => {
    for (const url of ['/v1/horriot/sync', '/api/horriot/sync']) {
      const noAuth = await app.inject({ method: 'POST', url, payload: { farm_id: FARM_ID } });
      assert.equal(noAuth.statusCode, 401, url);
      const noFarm = await app.inject({ method: 'POST', url, headers: auth, payload: {} });
      assert.equal(noFarm.statusCode, 400, url);
      assert.match(noFarm.json().error, /farm_id/);
    }
  });

  it('несуществующий маршрут → 404 JSON', async () => {
    const res = await app.inject('/nope');
    assert.equal(res.statusCode, 404);
    assert.equal(typeof res.json().error, 'string');
  });
});

describe('HTTP API · STT-провайдер с ошибкой формата', () => {
  it('SttFormatError → 415', async () => {
    const stt: SttProvider = {
      name: 'yandex',
      transcribe: async () => {
        throw new SttFormatError('Формат записи audio/m4a не поддерживается');
      },
    };
    const app = await buildApp(makeDeps(stt));
    const m = multipart({}, { name: 'v.m4a', type: 'audio/m4a', data: Buffer.alloc(100, 1) });
    const res = await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...m });
    assert.equal(res.statusCode, 415);
    await app.close();
  });
  it('успешное распознавание → { text }', async () => {
    const stt: SttProvider = { name: 'openai', transcribe: async () => 'надой сто литров' };
    const app = await buildApp(makeDeps(stt));
    const m = multipart({}, { name: 'v.m4a', type: 'audio/m4a', data: Buffer.alloc(100, 1) });
    const res = await app.inject({ method: 'POST', url: '/v1/assistant/transcribe', ...m });
    assert.deepEqual(res.json(), { text: 'надой сто литров' });
    await app.close();
  });
});
