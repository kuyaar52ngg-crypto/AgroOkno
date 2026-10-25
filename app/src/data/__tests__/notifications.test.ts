// Уведомления kind = 'admin' (рассылки и ответы поддержки) — свой вид с иконкой в F3; неизвестные виды → 'sync'.
// В локальной БД и при отправке на сервер kind не меняется (иначе «прочитано» перезаписало бы его).
// Нативные модули подменяются заглушками (как в horriot.test.ts): SQLite недоступна → локальная БД работает в памяти.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Module from 'node:module';
import { before, describe, it } from 'node:test';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
process.env.EXPO_PUBLIC_DEMO_DATE = '2026-10-23';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const stubs: Record<string, unknown> = {
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'web' } },
  'expo-sqlite': { openDatabaseAsync: async () => { throw new Error('SQLite недоступна в Node (ожидаемо)'); } },
  'expo-sqlite/localStorage/install': {},
  'expo-crypto': { randomUUID },
};
const M = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = M._load;
M._load = (request: string, ...rest: unknown[]) => (request in stubs ? stubs[request] : originalLoad.call(Module, request, ...rest));

const FARM_ID = 'f0000000-0000-4000-8000-000000000001';

const note = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id, farm_id: FARM_ID, kind, title: `Уведомление ${id}`, body: 'Текст', form_code: null, read: false,
  created_at: '2026-10-25T01:00:00Z', updated_at: '2026-10-25T01:00:00Z', deleted_at: null, ...extra,
});

type Mods = { entities: typeof import('../entities'); actions: typeof import('../actions'); store: typeof import('../store') };
let m: Mods;

describe('Уведомления kind = admin в приложении', () => {
  before(async () => {
    m = { entities: await import('../entities'), actions: await import('../actions'), store: await import('../store') };
    await m.store.initStore();
  });

  it('notificationKind: известные виды (и admin) без изменений, неизвестные → sync', () => {
    for (const kind of ['overdue', 'deadline', 'sync', 'submitted', 'admin'] as const) assert.equal(m.entities.notificationKind(kind), kind);
    assert.equal(m.entities.notificationKind('что-то новое'), 'sync');
    assert.equal(m.entities.notificationKind(undefined), 'sync');
  });

  it('toNotification: рассылка администратора получает вид admin и сохраняет остальные поля', () => {
    const n = m.entities.toNotification(note('n-1', 'admin', { title: 'Ответ поддержки · AGRO-2026-0001', body: 'Обновите приложение' }));
    assert.deepEqual(n, {
      id: 'n-1',
      kind: 'admin',
      title: 'Ответ поддержки · AGRO-2026-0001',
      body: 'Обновите приложение',
      created_at: '2026-10-25T01:00:00Z',
      read: false,
    });
  });

  it('«Отметить прочитанными»: в локальной строке (и в очереди отправки) kind остаётся admin', () => {
    m.store.applyServerRows('notifications', 'id', [note('n-2', 'admin'), note('n-3', 'deadline')]);
    m.actions.markNotificationsRead(['n-2']);
    const rows = m.store.rows('notifications');
    const admin = rows.find((r) => r.id === 'n-2')!;
    assert.equal(admin.kind, 'admin');
    assert.equal(admin.read, true);
    assert.equal(rows.find((r) => r.id === 'n-3')!.read, false);
    assert.deepEqual(m.entities.toNotification(admin).kind, 'admin');
    assert.ok(m.store.pendingDocs().some((d) => d.tbl === 'notifications' && d.id === 'n-2'), 'изменение ждёт отправки с исходным kind');
  });
});
