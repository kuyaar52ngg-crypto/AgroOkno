// Слой данных «Хорриота» без сети и без нативных модулей: подключение, «Передать данные», сверка с книгой, очередь синхронизации.
// Нативные модули подменяются заглушками (как в scripts/data-smoke.ts): SQLite недоступна → локальная БД работает в памяти.
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
const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const TODAY = '2026-10-23';

type Mods = {
  actions: typeof import('../actions');
  store: typeof import('../store');
  v3: typeof import('../v3');
  session: typeof import('../session');
  sync: typeof import('../sync');
};
let m: Mods;

const movement = (id: string, occurred_on: string, animal_group: string, kind: string, heads: number) => ({
  id, farm_id: FARM_ID, occurred_on, animal_group, kind, heads, live_weight_kg: null, amount_rub: null, mercury_status: 'not_required',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null,
});

describe('Хорриот · слой данных (офлайн)', () => {
  before(async () => {
    m = {
      actions: await import('../actions'),
      store: await import('../store'),
      v3: await import('../v3'),
      session: await import('../session'),
      sync: await import('../sync'),
    };
    await m.store.initStore();
    m.store.applyServerRows('farms', 'id', [
      { id: FARM_ID, owner_id: USER_ID, legal_status: 'lph', name: 'ЛПХ Ивановых', book_record_no: '0142', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null },
    ]);
    m.store.applyServerRows('livestock_movements', 'id', [
      movement('11111111-1111-4111-8111-000000000001', '2026-01-01', 'cattle_cows', 'opening_balance', 15),
      movement('11111111-1111-4111-8111-000000000002', '2026-01-01', 'horses_young', 'opening_balance', 7),
      movement('11111111-1111-4111-8111-000000000003', '2026-10-05', 'horses_young', 'birth', 6),
      movement('11111111-1111-4111-8111-000000000004', '2026-10-12', 'horses_young', 'death', 1),
    ]);
    m.session.session.userId = USER_ID;
    m.session.session.status = 'signed_in';
  });

  it('до подключения: статус not_connected, записей нет, расхождение равно книге, все записи журнала ждут передачи', () => {
    const s = m.v3.computeHorriot(TODAY)!;
    assert.deepEqual(s.connection, { status: 'not_connected', synced_at: null });
    assert.deepEqual(s.records, []);
    assert.equal(s.pending_count, 4);
    assert.deepEqual(s.reconciliation.map((r) => [r.animal_group, r.book_heads, r.horriot_heads, r.diff]), [
      ['cattle_cows', 15, 0, 15],
      ['horses_young', 12, 0, 12],
    ]);
    assert.throws(() => m.actions.horriotRefresh(), /Хорриот не подключён/);
  });

  it('подключение и «Передать данные»: записи УЧ-ХР-NNN, сверка без расхождений, идемпотентность', () => {
    const conn = m.actions.horriotConnect();
    assert.equal(conn.status, 'connected_demo');
    assert.ok(conn.synced_at);

    const after = m.actions.horriotRefresh();
    assert.equal(after.status, 'connected_demo');
    const s = m.v3.computeHorriot(TODAY)!;
    assert.equal(s.records.length, 4);
    assert.equal(s.pending_count, 0);
    assert.ok(s.reconciliation.every((r) => r.diff === 0));
    assert.deepEqual(s.records.map((r) => r.number).sort(), ['УЧ-ХР-001', 'УЧ-ХР-002', 'УЧ-ХР-003', 'УЧ-ХР-004']);
    const death = s.records.find((r) => r.reason === 'Падёж')!;
    assert.deepEqual([death.kind, death.animal_group, death.group_label, death.heads, death.registered_on], ['disposal', 'horses_young', 'Молодняк лошадей', 1, '2026-10-12']);
    assert.equal(death.source_movement_id, '11111111-1111-4111-8111-000000000004');
    // свежие даты сверху
    assert.deepEqual(s.records.map((r) => r.registered_on), ['2026-10-12', '2026-10-05', '2026-01-01', '2026-01-01']);

    m.actions.horriotRefresh();
    assert.equal(m.store.rows('horriot_records').length, 4, 'повторная передача ничего не дублирует');
  });

  it('новая запись журнала → ждёт передачи и даёт расхождение; после передачи номера продолжаются', () => {
    m.actions.createEvent({
      type: 'livestock', occurred_on: TODAY, note: null, animal_group: 'cattle_cows', kind: 'sale', heads: 3, live_weight_kg: null, amount_rub: null,
      counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null, mercury_status: 'not_required',
    });
    const mid = m.v3.computeHorriot(TODAY)!;
    assert.equal(mid.pending_count, 1);
    assert.deepEqual(mid.reconciliation.find((r) => r.animal_group === 'cattle_cows'), { animal_group: 'cattle_cows', label: 'Коровы', book_heads: 12, horriot_heads: 15, diff: -3 });

    m.actions.horriotRefresh();
    const done = m.v3.computeHorriot(TODAY)!;
    assert.equal(done.pending_count, 0);
    assert.ok(done.reconciliation.every((r) => r.diff === 0));
    assert.equal(done.records.find((r) => r.reason === 'Продажа')?.number, 'УЧ-ХР-005');
  });

  it('правка записи журнала после передачи не меняет Хорриот — сверка показывает расхождение', () => {
    const birth = m.store.rows('livestock_movements').find((r) => r.kind === 'birth')!;
    m.actions.updateEvent(String(birth.id), {
      type: 'livestock', occurred_on: '2026-10-05', note: null, animal_group: 'horses_young', kind: 'birth', heads: 8, live_weight_kg: null, amount_rub: null,
      counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null, mercury_status: 'not_required',
    });
    const s = m.v3.computeHorriot(TODAY)!;
    const young = s.reconciliation.find((r) => r.animal_group === 'horses_young')!;
    assert.deepEqual([young.book_heads, young.horriot_heads, young.diff], [14, 12, 2]);
    assert.equal(s.pending_count, 0, 'запись уже передавалась — новой записи Хорриота не создаётся');
  });

  it('записи Хорриота и подключение уходят в очередь синхронизации; таблицы optional и идут после журнала поголовья', () => {
    const pending = m.store.pendingDocs().map((d) => d.tbl);
    assert.ok(pending.includes('horriot_records') && pending.includes('horriot_connections'));
    const names = m.sync.TABLES.map((t) => t.name);
    assert.ok(names.indexOf('horriot_records') > names.indexOf('livestock_movements'));
    for (const name of ['horriot_connections', 'horriot_records']) {
      const def = m.sync.tableDef(name);
      assert.deepEqual([def.push, def.optional], [true, true], name);
    }
    assert.equal(m.sync.tableDef('horriot_connections').key, 'farm_id');
  });

  it('повторное подключение сохраняет статус; мягко удалённое подключение считается отключённым', () => {
    m.store.softDelete('horriot_connections', FARM_ID, '2026-10-23T05:00:00Z');
    assert.equal(m.v3.computeHorriot(TODAY)!.connection.status, 'not_connected');
    assert.throws(() => m.actions.horriotRefresh(), /не подключён/);
    assert.equal(m.actions.horriotConnect().status, 'connected_demo');
    assert.equal(m.v3.computeHorriot(TODAY)!.connection.status, 'connected_demo');
  });
});
