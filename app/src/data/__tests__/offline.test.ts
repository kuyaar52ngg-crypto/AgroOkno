// Сценарий «неделю без сети»: токен входа истёк (живёт час), связи нет, приложение перезапущено.
// Пользователь остаётся в приложении на локальном кеше, новые записи копятся в очереди и не теряются.
// Нативные модули подменяются заглушками (как в notifications.test.ts).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Module from 'node:module';
import { after, before, describe, it } from 'node:test';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
process.env.EXPO_PUBLIC_DEMO_DATE = '2026-10-23';

const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const FARM_ID = 'f0000000-0000-4000-8000-000000000001';
const WEEK_AGO = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

// Сессия Supabase, сохранённая неделю назад: access token давно истёк.
const mem = new Map<string, string>([
  [
    'sb-localhost-auth-token',
    JSON.stringify({
      access_token: 'expired-access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: WEEK_AGO + 3600,
      user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'u1@agrookno.app', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
    }),
  ],
]);
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
// Сети нет: любой запрос падает так же, как fetch в телефоне без связи.
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls += 1;
  throw new TypeError('Network request failed');
}) as typeof fetch;

const stubs: Record<string, unknown> = {
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'web' } },
  'expo-sqlite': { openDatabaseAsync: async () => { throw new Error('SQLite недоступна в Node (ожидаемо)'); } },
  'expo-sqlite/localStorage/install': {},
  'expo-crypto': { randomUUID },
};
const M = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = M._load;
M._load = (request: string, ...rest: unknown[]) => (request in stubs ? stubs[request] : originalLoad.call(Module, request, ...rest));

type Mods = { session: typeof import('../session'); actions: typeof import('../actions'); store: typeof import('../store'); net: typeof import('../net') };
let m: Mods;

describe('Неделя без сети', () => {
  before(async () => {
    m = { session: await import('../session'), actions: await import('../actions'), store: await import('../store'), net: await import('../net') };
    // Кеш с прошлого запуска: хозяйство пользователя и привязка кеша к нему.
    await m.store.initStore();
    m.store.setMeta('user_id', USER_ID);
    m.store.setMeta('last_synced_at', new Date(WEEK_AGO * 1000).toISOString());
    m.store.applyServerRows('farms', 'id', [
      { id: FARM_ID, owner_id: USER_ID, name: 'ЛПХ Ивановых', legal_status: 'lph', updated_at: '2026-10-16T00:00:00Z', deleted_at: null },
    ]);
  });

  it('истёкший токен без связи не выкидывает на экран входа и не держит заставку', async () => {
    const started = Date.now();
    await m.session.initData();
    assert.ok(Date.now() - started < 5_000, `старт без сети занял ${Date.now() - started} мс`);
    assert.equal(m.session.session.status, 'signed_in');
    assert.equal(m.session.currentUserId(), USER_ID);
    assert.equal(m.session.currentFarmId(), FARM_ID);
    await m.session.syncNow({ force: true });
    assert.ok(fetchCalls > 0, 'клиент пытался связаться с сервером');
    assert.equal(m.net.net.online, false, 'приложение знает, что связи нет');
  });

  it('записи за неделю копятся в очереди и переживают неудачные попытки отправки', async () => {
    for (let day = 0; day < 7; day++) {
      m.actions.createEvent({
        type: 'product_output', occurred_on: `2026-10-${String(16 + day).padStart(2, '0')}`, note: null,
        product: 'milk', quantity: 120, source_group: 'cattle_cows',
      });
    }
    assert.equal(m.store.pendingCount(), 7);
    await m.session.retrySync();
    assert.equal(m.store.pendingCount(), 7, 'после ошибки сети записи остаются в очереди');
    assert.equal(m.net.net.online, false);
    assert.equal(m.store.rows('product_outputs').length, 7, 'записи видны в журнале');
  });

  after(async () => {
    // Фоновая синхронизация и автообновление токена иначе держат процесс теста.
    m.session.deactivateUser();
    (await import('../../lib/supabase')).supabase.auth.stopAutoRefresh();
  });
});
