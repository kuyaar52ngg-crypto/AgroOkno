// Тесты демо-«Хорриота»: планировщик передачи (номера, виды, идемпотентность) и сверка с похозяйственной книгой.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MovementKind } from '../../data/contract';
import {
  diffNote,
  horriotBalanceOn,
  horriotKindOf,
  isReconciled,
  nextHorriotNumber,
  pendingHorriotSources,
  planHorriotSync,
  reconcileHorriot,
  type HorriotRecordRow,
  type HorriotSource,
} from '../horriot';
import type { MovementRow } from '../types';
import { lphData } from './fixtures';

const TODAY = '2026-10-23';

/** Журнал демо-ЛПХ с id записей (в фикстуре их нет). */
function movements(): (MovementRow & { id: string })[] {
  return lphData().movements.map((m, i) => ({ ...m, id: `m${String(i + 1).padStart(2, '0')}` }));
}

const sourcesOf = (rows: MovementRow[]): HorriotSource[] =>
  rows.map((m) => ({ id: m.id!, occurred_on: m.occurred_on, animal_group: m.animal_group, kind: m.kind, heads: m.heads }));

const recordsOf = (planned: ReturnType<typeof planHorriotSync>): HorriotRecordRow[] =>
  planned.map((p) => ({ kind: p.kind, animal_group: p.animal_group, heads: p.heads, registered_on: p.registered_on }));

describe('Хорриот · виды записей и номера', () => {
  it('приход — регистрация, расход — выбытие (все виды операций журнала)', () => {
    const incoming: MovementKind[] = ['opening_balance', 'birth', 'purchase', 'transfer_in'];
    const outgoing: MovementKind[] = ['sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out'];
    for (const k of incoming) assert.equal(horriotKindOf(k), 'registration', k);
    for (const k of outgoing) assert.equal(horriotKindOf(k), 'disposal', k);
  });

  it('следующий номер продолжает максимальный существующий', () => {
    assert.equal(nextHorriotNumber([]), 1);
    assert.equal(nextHorriotNumber(['УЧ-ХР-001', 'УЧ-ХР-007', 'УЧ-ХР-003']), 8);
  });
});

describe('Хорриот · планировщик передачи', () => {
  it('создаёт запись на каждую запись журнала: номера УЧ-ХР-001…, подписи и причины по-русски', () => {
    const planned = planHorriotSync(sourcesOf(movements()), [], new Set());
    assert.equal(planned.length, 9);
    assert.deepEqual(
      planned.map((p) => p.number),
      ['УЧ-ХР-001', 'УЧ-ХР-002', 'УЧ-ХР-003', 'УЧ-ХР-004', 'УЧ-ХР-005', 'УЧ-ХР-006', 'УЧ-ХР-007', 'УЧ-ХР-008', 'УЧ-ХР-009'],
    );
    const birth = planned.find((p) => p.reason === 'Рождение')!;
    assert.deepEqual(
      [birth.kind, birth.animal_group, birth.group_label, birth.heads, birth.registered_on],
      ['registration', 'horses_young', 'Молодняк лошадей', 6, '2026-10-05'],
    );
    const death = planned.find((p) => p.reason === 'Падёж')!;
    assert.deepEqual([death.kind, death.heads], ['disposal', 1]);
    const slaughter = planned.find((p) => p.reason === 'Забой')!;
    assert.deepEqual([slaughter.kind, slaughter.registered_on], ['disposal', '2026-10-15']);
    assert.ok(planned.filter((p) => p.reason === 'Начальный остаток').every((p) => p.kind === 'registration' && p.registered_on === '2026-01-01'));
    // привязка к источнику — для идемпотентности
    assert.equal(new Set(planned.map((p) => p.source_movement_id)).size, 9);
  });

  it('порядок: по дате, внутри даты — регистрации раньше выбытий', () => {
    const planned = planHorriotSync(
      [
        { id: 'a', occurred_on: '2026-05-01', animal_group: 'sheep', kind: 'sale', heads: 2 },
        { id: 'b', occurred_on: '2026-05-01', animal_group: 'sheep', kind: 'birth', heads: 5 },
        { id: 'c', occurred_on: '2026-04-01', animal_group: 'sheep', kind: 'opening_balance', heads: 10 },
      ],
      [],
      new Set(),
    );
    assert.deepEqual(planned.map((p) => p.source_movement_id), ['c', 'b', 'a']);
  });

  it('идемпотентно: уже переданные записи не дублируются, номера продолжаются', () => {
    const src = sourcesOf(movements());
    const first = planHorriotSync(src, [], new Set());
    const done = new Set(first.slice(0, 6).map((p) => p.source_movement_id));
    const second = planHorriotSync(src, first.slice(0, 6).map((p) => p.number), done);
    assert.equal(second.length, 3);
    assert.equal(second[0]!.number, 'УЧ-ХР-007');
    assert.equal(planHorriotSync(src, first.map((p) => p.number), new Set(first.map((p) => p.source_movement_id))).length, 0);
    assert.equal(pendingHorriotSources(src, done).length, 3);
  });

  it('новая запись после передачи попадает в следующую передачу', () => {
    const src = sourcesOf(movements());
    const first = planHorriotSync(src, [], new Set());
    const added: HorriotSource = { id: 'new', occurred_on: '2026-10-22', animal_group: 'sheep', kind: 'purchase', heads: 3 };
    const next = planHorriotSync([...src, added], first.map((p) => p.number), new Set(first.map((p) => p.source_movement_id)));
    assert.deepEqual(next.map((p) => [p.number, p.reason, p.group_label]), [['УЧ-ХР-010', 'Покупка', 'Овцы']]);
  });
});

describe('Хорриот · сверка с книгой', () => {
  it('до передачи расхождение равно книге, после — ноль по всем группам', () => {
    const rows = movements();
    const before = reconcileHorriot(rows, [], TODAY);
    assert.ok(before.length > 0 && before.every((r) => r.horriot_heads === 0 && r.diff === r.book_heads));
    assert.equal(isReconciled(before), false);

    const planned = planHorriotSync(sourcesOf(rows), [], new Set());
    const after = reconcileHorriot(rows, recordsOf(planned), TODAY);
    assert.equal(isReconciled(after), true);
    assert.deepEqual(
      after.map((r) => [r.animal_group, r.label, r.book_heads]),
      [
        ['cattle_cows', 'Коровы', 15],
        ['cattle_calves', 'Телята', 8],
        ['horses_mares', 'Кобылы', 18],
        ['horses_young', 'Молодняк лошадей', 10],
        ['horses_stallions', 'Жеребцы', 4],
        ['sheep', 'Овцы', 24],
      ],
    );
  });

  it('подсчёт Хорриота: Σ регистраций − Σ выбытий, не ниже нуля, будущие даты не учитываются', () => {
    const recs: HorriotRecordRow[] = [
      { kind: 'registration', animal_group: 'sheep', heads: 10, registered_on: '2026-01-01' },
      { kind: 'disposal', animal_group: 'sheep', heads: 4, registered_on: '2026-02-01' },
      { kind: 'registration', animal_group: 'sheep', heads: 7, registered_on: '2026-12-01' },
      { kind: 'disposal', animal_group: 'goats', heads: 3, registered_on: '2026-02-01' },
    ];
    const b = horriotBalanceOn(recs, TODAY);
    assert.equal(b.sheep, 6);
    assert.equal(b.goats, 0);
  });

  it('частичная передача: diff = книга − Хорриот; правка записи после передачи даёт расхождение', () => {
    const rows = movements();
    const planned = planHorriotSync(sourcesOf(rows), [], new Set());
    // Хорриот узнал только про начальные остатки
    const partial = recordsOf(planned.filter((p) => p.reason === 'Начальный остаток'));
    const rec = reconcileHorriot(rows, partial, TODAY);
    const young = rec.find((r) => r.animal_group === 'horses_young')!;
    assert.deepEqual([young.book_heads, young.horriot_heads, young.diff], [10, 7, 3]);
    assert.equal(diffNote(young), 'Не передано в Хорриот: 3');
    assert.equal(diffNote(rec.find((r) => r.animal_group === 'sheep')!), 'Совпадает');

    // после передачи фермер увеличил падёж в журнале: в Хорриоте теперь больше голов, чем в книге
    const all = recordsOf(planned);
    const edited = rows.map((m) => (m.kind === 'death' ? { ...m, heads: 2 } : m));
    const diverged = reconcileHorriot(edited, all, TODAY).find((r) => r.animal_group === 'horses_young')!;
    assert.deepEqual([diverged.book_heads, diverged.horriot_heads, diverged.diff], [9, 10, -1]);
    assert.equal(diffNote(diverged), 'В Хорриоте больше на 1');
  });

  it('группы без животных и без записей в таблицу не попадают', () => {
    assert.deepEqual(reconcileHorriot([], [], TODAY), []);
    const sold: MovementRow[] = [
      { occurred_on: '2026-01-01', animal_group: 'rabbits', kind: 'opening_balance', heads: 4, live_weight_kg: null, amount_rub: null },
      { occurred_on: '2026-03-01', animal_group: 'rabbits', kind: 'sale', heads: 4, live_weight_kg: null, amount_rub: null },
    ];
    assert.deepEqual(reconcileHorriot(sold, [], TODAY), []);
  });
});
