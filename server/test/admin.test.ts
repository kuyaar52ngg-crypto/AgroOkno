// Админ-маршруты /v1/admin/*: права (403 не-админу), валидация PUT, список моделей OpenRouter, блокировка пользователей
// (сервисный ключ), рассылки с Expo push, CORS для панели на другом домене, а также выбор модели помощника из настройки БД
// в /v1/assistant/messages и /health.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildApp } from '../src/app';
import { createModelCatalog, createModelSettingsStore } from '../src/assistant/models';
import { createOpenRouterEngine } from '../src/assistant/openrouter';
import { createAssistantService } from '../src/assistant/service';
import { rulesEngine } from '../src/assistant/rules';
import type { Deps } from '../src/deps';
import { parseEnv } from '../src/env';
import type { PushMessage } from '../src/reminders/push';
import { createSttProvider } from '../src/stt';
import { FakeDb, RpcError } from './helpers/fakeSupabase';
import { FARM_ID, seedFarm, USER_ID } from './helpers/fixtures';

const env = parseEnv({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CRON_ENABLED: 'false',
});
const TOKEN = 'user-token';
const auth = { authorization: `Bearer ${TOKEN}` };
const ADMIN_EMAIL = 'kuyaar52ngg@gmail.com';
/** Email из токена — технический адрес учётной записи (не реальный контакт администратора). */
const TECH_EMAIL = '143512345660@agrookno.app';

const CATALOG = {
  data: [
    { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', context_length: 1_000_000, pricing: { prompt: '0.0000001', completion: '0.0000005' }, supported_parameters: ['tools'] },
    { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'meta/no-tools', name: 'Meta: Without tools', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] },
  ],
};

interface Setup {
  db: FakeDb;
  deps: Deps;
  state: {
    admin: boolean;
    saved: { model: string; fallback_models: string[]; updated_at: string | null; updated_by: string | null };
    catalogCalls: number;
    catalogOk: boolean;
    /** Вызовы auth.admin.updateUserById сервисного клиента. */
    bans: { id: string; attrs: Record<string, unknown> }[];
    /** Ошибка Supabase Auth для updateUserById (null — успех). */
    banError: { status?: number; code?: string; message: string } | null;
    /** Сообщения, отправленные через Expo push. */
    pushed: PushMessage[];
    /** Токены, которые Expo считает недействительными. */
    invalidTokens: string[];
    pushThrows: boolean;
  };
}

/** Приложение с «БД» (RPC is_app_admin / get|set_assistant_model_settings), подменой fetch OpenRouter и (по желанию) сервисным клиентом. */
function setup(options: { openrouter?: typeof fetch; service?: boolean; env?: ReturnType<typeof parseEnv> } = {}): Setup {
  const state: Setup['state'] = {
    admin: false,
    saved: { model: 'anthropic/claude-haiku-5.5', fallback_models: ['google/gemma-4-31b-it:free'], updated_at: null, updated_by: null },
    catalogCalls: 0,
    catalogOk: true,
    bans: [],
    banError: null,
    pushed: [],
    invalidTokens: [],
    pushThrows: false,
  };
  const db = seedFarm();
  db.rpcs.is_app_admin = () => state.admin;
  db.rpcs.get_assistant_model_settings = () => state.saved;
  db.rpcs.set_assistant_model_settings = (args) => {
    if (!state.admin) throw new RpcError('42501', 'Менять модель помощника могут только администраторы');
    if (String(args.p_model).includes(' ')) throw new RpcError('22023', 'Некорректный идентификатор модели');
    state.saved = { model: String(args.p_model), fallback_models: args.p_fallbacks as string[], updated_at: '2026-10-25T10:00:00Z', updated_by: ADMIN_EMAIL };
    return state.saved;
  };
  const engine = options.openrouter
    ? createOpenRouterEngine({ apiKey: 'sk-or-test', defaultModel: env.OPENROUTER_MODEL, fetchImpl: options.openrouter })
    : rulesEngine;
  const clock = () => new Date('2026-10-23T05:00:00Z');
  // Сервисный клиент: те же таблицы + auth.admin.updateUserById (блокировка через ban_duration).
  const service = options.service
    ? ({
        ...db.client(),
        auth: {
          admin: {
            updateUserById: async (id: string, attrs: Record<string, unknown>) => {
              state.bans.push({ id, attrs });
              if (state.banError) return { data: { user: null }, error: state.banError };
              return { data: { user: { id, banned_until: attrs.ban_duration === 'none' ? null : '2126-10-23T05:00:00Z' } }, error: null };
            },
          },
        },
      } as unknown as SupabaseClient)
    : null;
  const deps: Deps = {
    env: options.env ?? env,
    supabase: {
      verify: async (t) => (t === TOKEN ? { id: USER_ID, email: TECH_EMAIL } : null),
      forUser: () => db.client(),
      service: () => service,
    },
    assistant: createAssistantService(engine, { warn() {} }, clock),
    modelSettings: createModelSettingsStore({ defaultModel: env.OPENROUTER_MODEL }),
    modelCatalog: createModelCatalog({
      fetchImpl: (async () => {
        state.catalogCalls += 1;
        return state.catalogOk ? new Response(JSON.stringify(CATALOG), { status: 200 }) : new Response('{}', { status: 503 });
      }) as typeof fetch,
    }),
    stt: createSttProvider(env),
    push: {
      send: async (messages) => {
        if (state.pushThrows) throw new Error('Expo недоступен');
        state.pushed.push(...messages);
        return messages.map((m) => ({ token: m.to, ok: !state.invalidTokens.includes(m.to), invalidToken: state.invalidTokens.includes(m.to) }));
      },
    },
    clock,
  };
  return { db, deps, state };
}

describe('админ: права', () => {
  it('без токена 401; /me — is_admin по RPC is_app_admin', async () => {
    const { deps, state } = setup();
    const app = await buildApp(deps);
    assert.equal((await app.inject('/v1/admin/me')).statusCode, 401);
    assert.deepEqual((await app.inject({ url: '/v1/admin/me', headers: auth })).json(), { is_admin: false });
    state.admin = true;
    assert.deepEqual((await app.inject({ url: '/v1/admin/me', headers: auth })).json(), { is_admin: true });
    await app.close();
  });

  it('не-админ: PUT настройки и список моделей → 403, RPC записи не вызывается', async () => {
    const { db, deps } = setup();
    const app = await buildApp(deps);
    const put = await app.inject({ method: 'PUT', url: '/v1/admin/assistant-settings', headers: auth, payload: { model: 'google/gemma-4-31b-it:free', fallback_models: [] } });
    assert.equal(put.statusCode, 403);
    assert.equal(put.json().code, 'forbidden');
    assert.match(put.json().error, /только администраторы/);
    assert.equal(db.calls.filter((c) => c.table === 'rpc:set_assistant_model_settings').length, 0);

    const models = await app.inject({ url: '/v1/admin/models', headers: auth });
    assert.equal(models.statusCode, 403);
    assert.match(models.json().error, /только администраторам/);
    await app.close();
  });

  it('GET настройки доступен любому пользователю', async () => {
    const { deps } = setup();
    const app = await buildApp(deps);
    const res = await app.inject({ url: '/v1/admin/assistant-settings', headers: auth });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { model: 'anthropic/claude-haiku-5.5', fallback_models: ['google/gemma-4-31b-it:free'], updated_at: null, updated_by: null });
    await app.close();
  });

  it('база без миграции v3 (PGRST202) → 503 с понятным текстом', async () => {
    const { db, deps } = setup();
    db.rpcs.get_assistant_model_settings = () => {
      throw new RpcError('PGRST202', 'Could not find the function public.get_assistant_model_settings');
    };
    const app = await buildApp(deps);
    const res = await app.inject({ url: '/v1/admin/assistant-settings', headers: auth });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, 'db_outdated');
    await app.close();
  });
});

describe('админ: PUT /v1/admin/assistant-settings', () => {
  it('валидация: пустая модель, больше трёх запасных, повторы, неверные типы → 400', async () => {
    const { db, deps, state } = setup();
    state.admin = true;
    const app = await buildApp(deps);
    const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/v1/admin/assistant-settings', headers: auth, payload: payload as object });
    for (const payload of [
      { model: '', fallback_models: [] },
      { model: '   ', fallback_models: [] },
      { fallback_models: [] },
      { model: 'a/b', fallback_models: ['c/1', 'c/2', 'c/3', 'c/4'] },
      { model: 'a/b', fallback_models: ['c/1', 'c/1'] },
      { model: 'a/b', fallback_models: ['a/b'] },
      { model: 'a/b', fallback_models: [''] },
      { model: 'a/b', fallback_models: 'c/1' },
      { model: 42, fallback_models: [] },
    ]) {
      const res = await put(payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().code, 'validation');
    }
    assert.equal(db.calls.filter((c) => c.table === 'rpc:set_assistant_model_settings').length, 0, 'невалидное в БД не уходит');
    await app.close();
  });

  it('админ сохраняет модель: RPC получает model и fallbacks, ответ — AssistantModelSettings, кеш сервера обновлён', async () => {
    const { db, deps, state } = setup();
    state.admin = true;
    const app = await buildApp(deps);
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/assistant-settings',
      headers: auth,
      payload: { model: ' google/gemma-4-31b-it:free ', fallback_models: ['nvidia/nemotron-3-super-120b-a12b:free'] },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      model: 'google/gemma-4-31b-it:free',
      fallback_models: ['nvidia/nemotron-3-super-120b-a12b:free'],
      updated_at: '2026-10-25T10:00:00Z',
      updated_by: ADMIN_EMAIL,
    });
    const rpc = db.calls.find((c) => c.table === 'rpc:set_assistant_model_settings');
    assert.deepEqual(rpc?.payload, { p_model: 'google/gemma-4-31b-it:free', p_fallbacks: ['nvidia/nemotron-3-super-120b-a12b:free'] });
    assert.equal(deps.modelSettings.peek().model, 'google/gemma-4-31b-it:free');

    // запасные моделей можно не передавать
    const only = await app.inject({ method: 'PUT', url: '/v1/admin/assistant-settings', headers: auth, payload: { model: 'anthropic/claude-haiku-5.5' } });
    assert.equal(only.statusCode, 200);
    assert.deepEqual(only.json().fallback_models, []);
    await app.close();
  });

  it('ошибка БД (22023) приходит как 400 с русским текстом', async () => {
    const { deps, state } = setup();
    state.admin = true;
    const app = await buildApp(deps);
    const res = await app.inject({ method: 'PUT', url: '/v1/admin/assistant-settings', headers: auth, payload: { model: 'bad model', fallback_models: [] } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /Некорректный идентификатор/);
    await app.close();
  });
});

describe('админ: GET /v1/admin/models', () => {
  it('админ получает только модели с tools; free по :free или нулевой цене; повторный запрос — из кеша', async () => {
    const { deps, state } = setup();
    state.admin = true;
    const app = await buildApp(deps);
    const res = await app.inject({ url: '/v1/admin/models', headers: auth });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().models, [
      { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', free: false, context_length: 1_000_000 },
      { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', free: true, context_length: 262144 },
    ]);
    await app.inject({ url: '/v1/admin/models', headers: auth });
    assert.equal(state.catalogCalls, 1, 'кеш 10 минут');
    await app.close();
  });

  it('OpenRouter недоступен → 502 с понятным текстом', async () => {
    const { deps, state } = setup();
    state.admin = true;
    state.catalogOk = false;
    const app = await buildApp(deps);
    const res = await app.inject({ url: '/v1/admin/models', headers: auth });
    assert.equal(res.statusCode, 502);
    assert.equal(res.json().code, 'openrouter_unavailable');
    await app.close();
  });
});

describe('помощник использует модель из настройки БД', () => {
  it('/v1/assistant/messages: models = основная + запасные из RPC, в ответе model_used и engine = openrouter; /health показывает модель', async () => {
    const seen: Record<string, unknown>[] = [];
    const openrouter = (async (_url: unknown, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          model: 'google/gemma-4-31b-it:free',
          choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'how_to', arguments: '{"title":"Как проверить отчет"}' } }] } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const { deps } = setup({ openrouter });
    const app = await buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/v1/assistant/messages', headers: auth, payload: { farm_id: FARM_ID, text: 'Как проверить отчет?' } });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.engine, 'openrouter');
    assert.equal(body.model_used, 'google/gemma-4-31b-it:free');
    assert.equal(body.reply.cards[0].kind, 'how_to');
    assert.deepEqual(seen[0]!.models, ['anthropic/claude-haiku-5.5', 'google/gemma-4-31b-it:free']);

    const health = (await app.inject('/health')).json();
    assert.equal(health.providers.llm, 'openrouter');
    assert.equal(health.model, 'anthropic/claude-haiku-5.5');
    await app.close();
  });

  it('сбой OpenRouter → ответ по правилам: engine = rules, model_used нет', async () => {
    const { deps } = setup({ openrouter: (async () => new Response('{"error":{"message":"down"}}', { status: 502 })) as typeof fetch });
    const app = await buildApp(deps);
    const res = await app.inject({ method: 'POST', url: '/v1/assistant/messages', headers: auth, payload: { farm_id: FARM_ID, text: 'Сегодня коровы дали 120 литров молока' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().engine, 'rules');
    assert.equal(res.json().model_used, undefined);
    assert.equal(res.json().proposed_events.length, 1);
    await app.close();
  });
});

// ─── Блокировка пользователей (сервисный ключ) ──────────────────────────────

const TARGET_ID = 'b0000000-0000-4000-8000-000000000002';
type App = Awaited<ReturnType<typeof buildApp>>;
const block = (app: App, id: string, payload?: object) =>
  app.inject({ method: 'POST', url: `/v1/admin/users/${id}/block`, headers: auth, ...(payload ? { payload } : {}) });
const unblock = (app: App, id: string) => app.inject({ method: 'POST', url: `/v1/admin/users/${id}/unblock`, headers: auth });

describe('админ: POST /v1/admin/users/:id/block и /unblock', () => {
  it('не-админ → 403, сервисный клиент не вызывается', async () => {
    const { db, deps, state } = setup({ service: true });
    const app = await buildApp(deps);
    for (const res of [await block(app, TARGET_ID, { reason: 'спам' }), await unblock(app, TARGET_ID)]) {
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().code, 'forbidden');
      assert.match(res.json().error, /только администраторы/);
    }
    assert.equal(state.bans.length, 0);
    assert.equal(db.rows('admin_audit_log').length, 0);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { deps } = setup({ service: true });
    const app = await buildApp(deps);
    assert.equal((await app.inject({ method: 'POST', url: `/v1/admin/users/${TARGET_ID}/block` })).statusCode, 401);
    await app.close();
  });

  it('нет SUPABASE_SERVICE_ROLE_KEY → 503 с понятным текстом (и для block, и для unblock)', async () => {
    const { deps, state } = setup({ service: false });
    state.admin = true;
    const app = await buildApp(deps);
    for (const res of [await block(app, TARGET_ID), await unblock(app, TARGET_ID)]) {
      assert.equal(res.statusCode, 503);
      assert.equal(res.json().error, 'На сервере не задан SUPABASE_SERVICE_ROLE_KEY');
      assert.equal(res.json().code, 'service_key_missing');
    }
    await app.close();
  });

  it('заблокировать себя нельзя → 400 (даже при заданном ключе), Auth не вызывается', async () => {
    const { deps, state } = setup({ service: true });
    state.admin = true;
    const app = await buildApp(deps);
    const res = await block(app, USER_ID);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().code, 'self_block');
    assert.match(res.json().error, /самого себя/);
    assert.equal(state.bans.length, 0);
    await app.close();
  });

  it('админ блокирует: ban_duration 876000h, строка user.block с причиной и email из app_admins, ответ { blocked: true }', async () => {
    const { db, deps, state } = setup({ service: true });
    state.admin = true;
    db.rows('app_admins').push({ email: ADMIN_EMAIL, user_id: USER_ID });
    const app = await buildApp(deps);
    const res = await block(app, TARGET_ID, { reason: '  Спам в обращениях  ' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { user_id: TARGET_ID, blocked: true, banned_until: '2126-10-23T05:00:00Z' });
    assert.deepEqual(state.bans, [{ id: TARGET_ID, attrs: { ban_duration: '876000h' } }]);
    assert.deepEqual(db.rows('admin_audit_log'), [
      { admin_id: USER_ID, admin_email: ADMIN_EMAIL, action: 'user.block', target_type: 'user', target_id: TARGET_ID, details: { reason: 'Спам в обращениях' } },
    ]);
    await app.close();
  });

  it('блокировка без тела и с пустым JSON-телом (Content-Type: application/json) работает; без записи в app_admins email берётся из токена', async () => {
    const { db, deps, state } = setup({ service: true });
    state.admin = true;
    const app = await buildApp(deps);
    assert.equal((await block(app, TARGET_ID)).statusCode, 200);
    const empty = await app.inject({ method: 'POST', url: `/v1/admin/users/${TARGET_ID}/block`, headers: { ...auth, 'content-type': 'application/json' } });
    assert.equal(empty.statusCode, 200);
    assert.equal(state.bans.length, 2);
    assert.equal(db.rows('admin_audit_log')[0]!.admin_email, TECH_EMAIL);
    assert.deepEqual(db.rows('admin_audit_log')[0]!.details, {});
    await app.close();
  });

  it('валидация: не uuid → 400, слишком длинная причина → 400, битый JSON → 400', async () => {
    const { deps, state } = setup({ service: true });
    state.admin = true;
    const app = await buildApp(deps);
    assert.equal((await block(app, 'not-a-uuid')).statusCode, 400);
    assert.equal((await block(app, TARGET_ID, { reason: 'я'.repeat(501) })).statusCode, 400);
    const broken = await app.inject({ method: 'POST', url: `/v1/admin/users/${TARGET_ID}/block`, headers: { ...auth, 'content-type': 'application/json' }, payload: '{"reason":' });
    assert.equal(broken.statusCode, 400);
    assert.equal(state.bans.length, 0);
    await app.close();
  });

  it('разблокировка: ban_duration none, строка user.unblock, banned_until null', async () => {
    const { db, deps, state } = setup({ service: true });
    state.admin = true;
    const app = await buildApp(deps);
    const res = await unblock(app, TARGET_ID);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { user_id: TARGET_ID, blocked: false, banned_until: null });
    assert.deepEqual(state.bans, [{ id: TARGET_ID, attrs: { ban_duration: 'none' } }]);
    assert.equal(db.rows('admin_audit_log')[0]!.action, 'user.unblock');
    await app.close();
  });

  it('пользователя нет в Auth → 404; сбой Auth → 502; запись в журнал не делается', async () => {
    const { db, deps, state } = setup({ service: true });
    state.admin = true;
    const app = await buildApp(deps);
    state.banError = { status: 404, code: 'user_not_found', message: 'User not found' };
    const missing = await block(app, TARGET_ID);
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().code, 'user_not_found');
    state.banError = { status: 500, message: 'boom' };
    const failed = await block(app, TARGET_ID);
    assert.equal(failed.statusCode, 502);
    assert.equal(failed.json().code, 'auth_admin_failed');
    assert.equal(db.rows('admin_audit_log').length, 0);
    await app.close();
  });
});

// ─── Рассылки ───────────────────────────────────────────────────────────────

const BROADCAST_ID = 'c0000000-0000-4000-8000-000000000001';
const U1 = 'a0000000-0000-4000-8000-000000000011';
const U2 = 'a0000000-0000-4000-8000-000000000012';
const U3 = 'a0000000-0000-4000-8000-000000000013';
const tok = (n: string) => `ExponentPushToken[${n}]`;

/** RPC admin_broadcast как в БД: только админ; в таблицах — токены получателей и чужой токен. */
function seedBroadcast(s: Setup): void {
  s.db.rpcs.admin_broadcast = () => {
    if (!s.state.admin) throw new RpcError('42501', 'Только для администраторов');
    return { broadcast_id: BROADCAST_ID, farms_count: 2, user_ids: [U1, U2, U3] };
  };
  s.db.rows('admin_broadcasts').push({ id: BROADCAST_ID, title: 'Плановые работы', push_sent: 0 });
  s.db.rows('push_tokens').push(
    { user_id: U1, token: tok('aaa'), platform: 'android' },
    { user_id: U1, token: tok('bbb'), platform: 'ios' },
    { user_id: U2, token: tok('ccc'), platform: 'android' },
    { user_id: U3, token: tok('ddd'), platform: 'android' },
    { user_id: 'a0000000-0000-4000-8000-000000000099', token: tok('zzz'), platform: 'android' }, // не получатель
  );
  s.db.rows('user_settings').push(
    { user_id: U2, push_enabled: false, sound: false, deleted_at: null },
    { user_id: U3, push_enabled: true, sound: true, deleted_at: null },
  );
}

const broadcast = (app: App, payload: object) => app.inject({ method: 'POST', url: '/v1/admin/broadcasts', headers: auth, payload });
const ALL = { title: 'Плановые работы', body: 'Сегодня с 22:00 до 23:00 сервис недоступен', target: 'all' };

describe('админ: POST /v1/admin/broadcasts', () => {
  it('не-админ → 403, RPC рассылки не вызывается, push не уходит', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.db.calls.length = 0;
    const app = await buildApp(s.deps);
    const res = await broadcast(app, ALL);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'forbidden');
    assert.equal(s.db.calls.filter((c) => c.table === 'rpc:admin_broadcast').length, 0);
    assert.equal(s.state.pushed.length, 0);
    await app.close();
  });

  it('валидация тела → 400, RPC не вызывается', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.state.admin = true;
    const app = await buildApp(s.deps);
    for (const payload of [
      { ...ALL, title: '  ' },
      { ...ALL, body: '' },
      { ...ALL, title: 'я'.repeat(121) },
      { ...ALL, body: 'я'.repeat(2001) },
      { ...ALL, target: 'everyone' },
      { title: 'a', body: 'b' },
      { ...ALL, target: 'status' },
      { ...ALL, target: 'status', status: 'zzz' },
      { ...ALL, target: 'farms' },
      { ...ALL, target: 'farms', farm_ids: [] },
      { ...ALL, target: 'farms', farm_ids: ['not-uuid'] },
    ]) {
      const res = await broadcast(app, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().code, 'validation');
    }
    assert.equal(s.db.calls.filter((c) => c.table === 'rpc:admin_broadcast').length, 0);
    await app.close();
  });

  it('с сервисным ключом: RPC от имени пользователя, push токенам получателей (без отключивших push), звук по настройкам, push_sent сохраняется', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.state.admin = true;
    const app = await buildApp(s.deps);
    const res = await broadcast(app, { ...ALL, title: '  Плановые работы ', target: 'status', status: 'kfh', farm_ids: [FARM_ID] });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { broadcast_id: BROADCAST_ID, farms_count: 2, push_sent: 3 });

    const rpc = s.db.calls.find((c) => c.table === 'rpc:admin_broadcast');
    assert.deepEqual(rpc?.payload, { p_title: 'Плановые работы', p_body: ALL.body, p_target: 'status', p_status: 'kfh', p_farm_ids: null });

    assert.deepEqual(
      s.state.pushed.map((m) => [m.to, m.sound]),
      [[tok('aaa'), null], [tok('bbb'), null], [tok('ddd'), 'default']],
      'U2 отключил push, чужой токен не затронут',
    );
    assert.equal(s.state.pushed[0]!.title, 'Плановые работы');
    assert.equal(s.state.pushed[0]!.body, ALL.body);
    assert.deepEqual(s.state.pushed[0]!.data, { kind: 'admin', broadcast_id: BROADCAST_ID });
    assert.equal(s.db.rows('admin_broadcasts')[0]!.push_sent, 3);
    await app.close();
  });

  it('target = farms передаёт farm_ids; длинный текст в push укорачивается', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.state.admin = true;
    const app = await buildApp(s.deps);
    const long = 'Слово '.repeat(100).trim();
    const res = await broadcast(app, { title: 'Длинное', body: long, target: 'farms', farm_ids: [FARM_ID], status: 'lph' });
    assert.equal(res.statusCode, 200);
    const rpc = s.db.calls.find((c) => c.table === 'rpc:admin_broadcast');
    assert.deepEqual(rpc?.payload, { p_title: 'Длинное', p_body: long, p_target: 'farms', p_status: null, p_farm_ids: [FARM_ID] });
    assert.ok(s.state.pushed[0]!.body.length <= 180);
    assert.ok(s.state.pushed[0]!.body.endsWith('…'));
    await app.close();
  });

  it('недействительные токены удаляются, push_sent считает только принятые', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.state.admin = true;
    s.state.invalidTokens = [tok('bbb')];
    const app = await buildApp(s.deps);
    const res = await broadcast(app, ALL);
    assert.equal(res.json().push_sent, 2);
    assert.equal(s.db.rows('admin_broadcasts')[0]!.push_sent, 2);
    assert.ok(!s.db.rows('push_tokens').some((t) => t.token === tok('bbb')));
    assert.ok(s.db.rows('push_tokens').some((t) => t.token === tok('aaa')));
    await app.close();
  });

  it('без сервисного ключа: только уведомления (RPC), push не отправляется, push_sent = 0', async () => {
    const s = setup({ service: false });
    seedBroadcast(s);
    s.state.admin = true;
    const app = await buildApp(s.deps);
    const res = await broadcast(app, ALL);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { broadcast_id: BROADCAST_ID, farms_count: 2, push_sent: 0 });
    assert.equal(s.db.calls.filter((c) => c.table === 'rpc:admin_broadcast').length, 1);
    assert.equal(s.state.pushed.length, 0);
    assert.equal(s.db.rows('admin_broadcasts')[0]!.push_sent, 0);
    await app.close();
  });

  it('сбой Expo не отменяет рассылку: 200 и push_sent = 0', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.state.admin = true;
    s.state.pushThrows = true;
    const app = await buildApp(s.deps);
    const res = await broadcast(app, ALL);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { broadcast_id: BROADCAST_ID, farms_count: 2, push_sent: 0 });
    await app.close();
  });

  it('нет токенов у получателей → push_sent = 0 без вызова Expo; ошибки БД: нет хозяйств → 400, миграция не применена → 503', async () => {
    const s = setup({ service: true });
    seedBroadcast(s);
    s.db.tables.push_tokens = [];
    s.state.admin = true;
    const app = await buildApp(s.deps);
    assert.equal((await broadcast(app, ALL)).json().push_sent, 0);
    assert.equal(s.state.pushed.length, 0);

    s.db.rpcs.admin_broadcast = () => {
      throw new RpcError('22023', 'Нет хозяйств для рассылки');
    };
    const none = await broadcast(app, ALL);
    assert.equal(none.statusCode, 400);
    assert.equal(none.json().error, 'Нет хозяйств для рассылки');

    s.db.rpcs.admin_broadcast = () => {
      throw new RpcError('PGRST202', 'Could not find the function public.admin_broadcast');
    };
    const outdated = await broadcast(app, ALL);
    assert.equal(outdated.statusCode, 503);
    assert.equal(outdated.json().code, 'db_outdated');
    await app.close();
  });
});

// ─── CORS: панель на другом домене ──────────────────────────────────────────

describe('CORS для веб-панели', () => {
  const preflight = (app: App, origin: string, url = '/v1/admin/broadcasts') =>
    app.inject({
      method: 'OPTIONS',
      url,
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
    });

  it('CORS_ORIGINS=* : preflight с Authorization и Content-Type проходит, источник отражается', async () => {
    const { deps } = setup();
    const app = await buildApp(deps);
    for (const url of ['/v1/admin/broadcasts', `/v1/admin/users/${TARGET_ID}/block`, '/v1/admin/assistant-settings']) {
      const res = await preflight(app, 'https://admin.agro-okno.vercel.app', url);
      assert.equal(res.statusCode, 204, url);
      assert.equal(res.headers['access-control-allow-origin'], 'https://admin.agro-okno.vercel.app');
      assert.match(String(res.headers['access-control-allow-headers']), /authorization/i);
      assert.match(String(res.headers['access-control-allow-headers']), /content-type/i);
      assert.match(String(res.headers['access-control-allow-methods']), /POST/);
      assert.match(String(res.headers['access-control-allow-methods']), /PUT/);
    }
    // обычный запрос с Origin тоже получает заголовок
    const real = await app.inject({ url: '/v1/admin/me', headers: { ...auth, origin: 'https://admin.agro-okno.vercel.app' } });
    assert.equal(real.headers['access-control-allow-origin'], 'https://admin.agro-okno.vercel.app');
    await app.close();
  });

  it('CORS_ORIGINS со списком: разрешённый домен проходит, чужой — без Access-Control-Allow-Origin', async () => {
    const listed = parseEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      CRON_ENABLED: 'false',
      CORS_ORIGINS: 'https://admin.agro-okno.vercel.app, http://localhost:5173',
    });
    const { deps } = setup({ env: listed });
    const app = await buildApp(deps);
    for (const origin of ['https://admin.agro-okno.vercel.app', 'http://localhost:5173']) {
      const res = await preflight(app, origin);
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], origin);
      assert.match(String(res.headers['access-control-allow-headers']), /authorization/i);
    }
    const foreign = await preflight(app, 'https://evil.example.com');
    assert.equal(foreign.headers['access-control-allow-origin'], undefined);
    await app.close();
  });
});

describe('Swagger содержит админ-маршруты на русском', () => {
  it('/docs/json: block, unblock и broadcasts описаны', async () => {
    const { deps } = setup();
    const app = await buildApp(deps);
    const res = await app.inject('/docs/json');
    assert.equal(res.statusCode, 200);
    const paths = res.json().paths as Record<string, Record<string, { summary?: string; description?: string }>>;
    for (const path of ['/v1/admin/users/{id}/block', '/v1/admin/users/{id}/unblock', '/v1/admin/broadcasts']) {
      const op = paths[path]?.post;
      assert.ok(op, path);
      assert.match(op.summary ?? '', /[а-яё]/i);
      assert.match(op.description ?? '', /SUPABASE_SERVICE_ROLE_KEY|push/);
    }
    await app.close();
  });
});
