// Интеграционная проверка слоя данных (вход, запись, синхронизация, RLS) на живом Supabase в Node.
// Нативные модули подменяются заглушками: SQLite недоступна → слой работает в режиме «только память».
// Запуск из каталога app: npx tsx scripts/data-smoke.ts
// Пишет данные только в учебный аккаунт без роли (ИНН 143500111222) и затем удаляет их (мягко).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { randomUUID } from 'node:crypto';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { initData, session } = await import('../src/data/session');
  const auth = await import('../src/data/auth');
  const actions = await import('../src/data/actions');
  const { retrySync, syncNow } = await import('../src/data/sync');
  const { currentFarmData, currentFarm, currentProfile } = await import('../src/data/entities');
  const { net } = await import('../src/data/net');
  const { computeHerd } = await import('../src/data/hooks');
  const { rows, pendingCount, getDoc, softDelete } = await import('../src/data/store');
  const { computeHorriot } = await import('../src/data/v3');
  const { buildDashboard } = await import('../src/reports/engine');

  await initData();
  assert.equal(session.status, 'signed_out');

  assert.deepEqual((await auth.signInWithInn('123', 'x')).ok, false);
  const bad = await auth.signInWithInn('143500111222', 'wrong');
  assert.ok(!bad.ok && bad.error === 'invalid_credentials', 'неверный пароль');

  const good = await auth.signInWithInn('143500111222', 'AgroOkno2026!');
  assert.equal(good.ok, true, 'вход');
  assert.equal(session.status, 'signed_in');
  const farm = currentFarm();
  assert.equal(farm?.name, 'Новое хозяйство');
  assert.equal(currentProfile()?.role, null);
  console.log('вход ок, хозяйство:', farm?.name);

  // Роль (шаг A7).
  assert.equal((await auth.setRole('farm_head')).ok, true);
  assert.equal(currentProfile()?.role, 'farm_head');
  console.log('роль установлена:', currentProfile()?.role);

  // Запись событий: сразу локально, потом на сервер.
  const today = '2026-10-23';
  const open = actions.createEvent({
    type: 'livestock', occurred_on: '2026-01-01', note: null, animal_group: 'cattle_cows', kind: 'opening_balance', heads: 10,
    live_weight_kg: null, amount_rub: null, counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null, mercury_status: 'not_required',
  });
  assert.equal(open.pending_sync, true);
  assert.equal(computeHerd(today).groups.find((g) => g.group === 'cattle_cows')?.heads, 10);
  assert.throws(
    () => actions.createEvent({ type: 'livestock', occurred_on: today, note: null, animal_group: 'cattle_cows', kind: 'death', heads: 11, live_weight_kg: null, amount_rub: null, counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null, mercury_status: 'not_required' }),
    /только 10 голов/,
  );
  const milk = actions.createEvent({ type: 'product_output', occurred_on: today, note: 'тест', product: 'milk', quantity: 41.2, source_group: 'cattle_cows' });
  const sale = actions.createEvent({ type: 'product_sale', occurred_on: today, note: null, product: 'milk', quantity: 20.6, amount_rub: 1000, buyer: 'Тест', buyer_inn: null, destination: null, vehicle_number: null, mercury_status: 'draft' });
  actions.createEvent({ type: 'feed', occurred_on: today, note: null, feed: 'hay', operation: 'harvest', quantity_t: 2.5, storage_place: 'Сеновал' });
  actions.createEvent({ type: 'crop', occurred_on: today, note: null, plot_name: 'Поле', crop: 'Картофель', operation: 'harvest', area_ha: 0.1, yield_t: 1.8 });
  const member = actions.addHouseholdMember({ full_name: 'Тестов Тест', birth_date: '1990-05-14', relation: 'Сестра', consent: true });
  actions.updateSettings({ sound: true });
  const ticket = actions.createSupportTicket({ topic: 'Вопрос', related_section: null, message: 'Тест', attachment_uri: null });
  actions.updateProfile({ phone: '+7 914 000 11 22' });
  assert.ok(pendingCount() >= 8, `в очереди ${pendingCount()}`);
  console.log('в очереди перед синхронизацией:', pendingCount(), 'номер обращения:', ticket.number);

  await retrySync();
  assert.equal(net.online, true);
  assert.equal(pendingCount(), 0, `после синхронизации очередь пуста (осталось ${pendingCount()}; ошибка: ${net.lastError})`);
  console.log('синхронизировано, очередь пуста');

  // Меркурий: подключение и обновление.
  actions.mercuryConnect();
  const conn = actions.mercuryRefresh();
  assert.equal(conn.status, 'connected_demo');
  const docs = rows('mercury_documents');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].number, 'УЧ-ВСД-001');
  assert.equal(docs[0].quantity, 20);
  assert.equal(getDoc('product_sales', sale.id)?.data.mercury_status, 'issued');
  await retrySync();
  assert.equal(pendingCount(), 0);

  // Хорриот (нужна применённая миграция v3): подключение, передача записей журнала, сверка с книгой.
  assert.throws(() => actions.horriotRefresh(), /не подключён/);
  actions.horriotConnect();
  const horriot = actions.horriotRefresh();
  assert.equal(horriot.status, 'connected_demo');
  const horriotRecords = rows('horriot_records');
  assert.equal(horriotRecords.length, 1);
  assert.equal(horriotRecords[0].number, 'УЧ-ХР-001');
  assert.equal(horriotRecords[0].kind, 'registration');
  assert.equal(horriotRecords[0].source_movement_id, open.id);
  actions.horriotRefresh(); // идемпотентно
  assert.equal(rows('horriot_records').length, 1);
  const state = computeHorriot(today)!;
  assert.equal(state.pending_count, 0);
  assert.deepEqual(state.reconciliation.map((r) => [r.animal_group, r.book_heads, r.horriot_heads, r.diff]), [['cattle_cows', 10, 10, 0]]);
  await retrySync();
  assert.equal(pendingCount(), 0, `после синхронизации Хорриота очередь пуста (осталось ${pendingCount()}; ошибка: ${net.lastError})`);
  console.log('Хорриот: передано', rows('horriot_records').length, 'запись, сверка без расхождений');

  // Обновление и удаление события; проверка на сервере (чтение от имени пользователя).
  actions.updateEvent(milk.id, { type: 'product_output', occurred_on: today, note: 'правка', product: 'milk', quantity: 50, source_group: 'cattle_cows' });
  const data = currentFarmData()!;
  assert.equal(data.outputs[0].quantity, 50);
  const dash = buildDashboard({ data, today });
  assert.equal(dash.household, null);
  await retrySync();

  // Чистим тестовые данные (мягкое удаление уходит на сервер).
  for (const id of [open.id, milk.id, sale.id]) {
    const e = rows('livestock_movements').concat(rows('product_outputs'), rows('product_sales')).find((r) => r.id === id);
    if (e) actions.deleteEvent(id, 'animal_group' in e ? 'livestock' : 'quantity_t' in e ? 'feed' : 'amount_rub' in e && 'buyer' in e ? 'product_sale' : 'product_output');
  }
  for (const r of rows('feed_events')) actions.deleteEvent(String(r.id), 'feed');
  for (const r of rows('crop_events')) actions.deleteEvent(String(r.id), 'crop');
  void member;
  for (const r of rows('horriot_records')) softDelete('horriot_records', String(r.id), new Date().toISOString());
  softDelete('horriot_connections', String(farm?.id), new Date().toISOString());
  await syncNow({ force: true });
  await sleep(200);
  console.log('Остаток в очереди после очистки:', pendingCount());

  await auth.signOut();
  await sleep(100);
  assert.equal(session.status, 'signed_out');
  console.log('слой данных: все проверки пройдены');
  process.exit(0);
}

main().catch((e) => {
  console.error('ОШИБКА:', e);
  process.exit(1);
});
