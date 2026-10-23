// Юнит-тесты мапперов отчётов. Запуск: npm test (node --test через tsx).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { NewEvent } from '../../data/contract';
import { currentMonthlyPeriod, dueDate, plannedObligations } from '../deadlines';
import { buildDashboard, buildObligation, buildObligations, buildPreview, toSnapshot, type EngineCtx } from '../engine';
import { computeFermer1 } from '../fermer1';
import { computeFermer2 } from '../fermer2';
import { buildFermer3Input, computeFermer3 } from '../fermer3';
import { computeIso1r } from '../iso1r';
import { computeKfh1 } from '../kfh1';
import { addMonths, balanceOn, dayBefore, kgToLiters, litersToKg, toCentners, toThousands } from '../period';
import { getEventDestinations } from '../routing';
import { computeSh10 } from '../sh10';
import { computeTabun1, tabunBalance } from '../tabun1';
import { kfhData, kfhFarm, lphData, lphFarm } from './fixtures';

const TODAY = '2026-10-23';
const lphCtx = (): EngineCtx => ({ data: lphData(), today: TODAY });

describe('единицы и границы периодов', () => {
  it('кг → центнеры, шт → тыс. шт, л ↔ кг', () => {
    assert.equal(toCentners(1236), 12.4);
    assert.equal(toCentners(5), 0.1);
    assert.equal(toThousands(1500), 1.5);
    assert.equal(litersToKg(1200), 1236);
    assert.equal(kgToLiters(1236), 1200);
  });

  it('сдвиг месяцев через границу года и день до даты', () => {
    assert.deepEqual(addMonths(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(addMonths(2026, 12, 1), { year: 2027, month: 1 });
    assert.equal(dayBefore('2026-10-01'), '2026-09-30');
  });

  it('поголовье на дату включительно, граница дня события', () => {
    const { movements } = lphData();
    assert.equal(balanceOn(movements, '2026-10-04').horses_young, 7);
    assert.equal(balanceOn(movements, '2026-10-05').horses_young, 13);
    assert.equal(balanceOn(movements, '2026-10-12').horses_young, 12);
    assert.equal(balanceOn(movements, '2026-10-15').horses_young, 10);
  });
});

describe('1-ТАБУН', () => {
  it('октябрь 2026: 29 + 6 − 1 − 2 = 32, состав 18 / 10 / 4', () => {
    const h = computeTabun1(lphData(), { year: 2026, month: 10 });
    assert.equal(h.opening, 29);
    assert.equal(h.born, 6);
    assert.equal(h.died, 1);
    assert.equal(h.slaughtered, 2);
    assert.equal(h.total, 32);
    assert.deepEqual([h.mares, h.young, h.stallions], [18, 10, 4]);
    const bal = tabunBalance(h);
    assert.equal(bal.formula, '29 + 6 − 1 − 2 = 32');
    assert.ok(bal.ok);
  });

  it('сентябрь: движений нет, баланс 29', () => {
    const h = computeTabun1(lphData(), { year: 2026, month: 9 });
    assert.equal(h.opening, 29);
    assert.equal(h.total, 29);
    assert.equal(h.born + h.died + h.slaughtered, 0);
  });
});

describe('10-СХ', () => {
  it('сентябрь: сено 18,0, сенаж 6,0, зерно 1,2, всего 25,2; сено от 22.10 не входит', () => {
    const r = computeSh10(lphData(), { year: 2026, month: 9 });
    assert.deepEqual([r.hay, r.haylage, r.grain, r.total], [18, 6, 1.2, 25.2]);
    assert.equal(computeSh10(lphData(), { year: 2026, month: 10 }).hay, 2.5);
  });
});

describe('1-ИСО-р', () => {
  it('79 голов: 15 + 8 + 32 + 24', () => {
    const r = computeIso1r(lphData().movements, TODAY);
    assert.deepEqual([r.cows, r.calves, r.horses, r.sheep, r.total, r.groupSum], [15, 8, 32, 24, 79, 79]);
  });
});

describe('3-фермер (годовая и месячная)', () => {
  it('месяц: надой за сентябрь 1 080 л = 11,1 ц, движение за период', () => {
    const input = buildFermer3Input(lphData(), { year: 2026, month: 9 });
    const r = computeFermer3(input);
    assert.equal(r.produced['08'], toCentners(1080 * 1.03 * 1));
    assert.equal(r.herd['30'], 29); // лошади
    assert.equal(r.herd['22'], 15); // коровы
  });

  it('октябрь: приплод 6 и падёж 1 в колонке «лошади»; забой 2 гол. и 5,0 ц живой массы', () => {
    const r = computeFermer3(buildFermer3Input(lphData(), { year: 2026, month: 10 }));
    assert.equal(r.movement['44'].horses, 6);
    assert.equal(r.movement['46'].horses, 1);
    assert.equal(r.movement['47'].horses, 2);
    assert.equal(r.produced['07'], 5);
    assert.equal(r.herd['30'], 32);
  });

  it('год: границы периода — события 2025 не попадают в 2026', () => {
    const data = kfhData();
    const y25 = computeFermer3(buildFermer3Input(data, { year: 2025 }));
    const y26 = computeFermer3(buildFermer3Input(data, { year: 2026 }));
    assert.equal(y25.produced['08'], toCentners(5200 + 5400));
    assert.equal(y26.produced['08'], 0);
    assert.equal(y25.sold['56'], toCentners(7000));
    assert.equal(y25.movement['44'].cattle, 34);
    assert.equal(y26.sold['53'], 2.5); // овцы: продажа 250 кг
  });

  it('телята входят в колонку КРС и в строку 21', () => {
    const r = computeFermer3(buildFermer3Input(kfhData(), { year: 2025 }));
    assert.equal(r.herd['21'], 40 + (22 + 34 - 3 - 10 - 12));
  });
});

describe('1-фермер', () => {
  it('площади сева 2025: яровая пшеница, прочие яровые, картофель, овощи, озимые осени 2024', () => {
    const { lines } = computeFermer1(kfhData(), 2025);
    assert.equal(lines['8'], 2);
    assert.equal(lines['9'], 6);
    assert.equal(lines['10'], 8);
    assert.equal(lines['18'], 0.8);
    assert.equal(lines['19'], 0.3);
    assert.equal(lines['1'], 1.5);
    assert.equal(lines['2'], 1.5);
    // всего = 7 (сохранились озимые) + 10 + 18 + 20 + …
    assert.equal(lines['26'], 10.6);
  });
});

describe('2-фермер', () => {
  it('сбор урожая 2025: ячмень 126 ц, 21 ц/га; картофель 144 ц; сено → естественные сенокосы', () => {
    const { lines } = computeFermer2(kfhData(), 2025);
    assert.equal(lines['1112'].gross_c, 126);
    assert.equal(lines['1112'].yield_c_ha, 21);
    assert.equal(lines['1301'].gross_c, 144);
    assert.equal(lines['1301'].yield_c_ha, 180);
    assert.equal(lines['1501'].gross_c, 900);
    assert.equal(lines['1502'].gross_c, 400);
    assert.ok(lines['1140'].sown_ha >= 6);
  });
});

describe('1-КФХ / 1-ИП', () => {
  it('2025: доходы тыс. руб., произведено, поголовье на начало/конец', () => {
    const r = computeKfh1(kfhData(), 2025);
    assert.equal(r.income['1100'].cur, 680 + 364 + 36);
    assert.equal(r.income['1100'].prev, 0);
    assert.equal(r.livestock['6110'].produced_c, toCentners(3000 + 3400 + 1600));
    assert.equal(r.livestock['6110'].sold_c, 34);
    assert.equal(r.livestock['6120'].produced_c, toCentners(10600));
    assert.equal(r.livestock['6120'].sold_c, 70);
    assert.equal(r.livestock['6140'].produced_c, 0.9);
    assert.equal(r.crops['5153'].produced_c, 144);
    assert.equal(r.crops['5162'].produced_c, 900);
    assert.equal(r.losses, 3);
    assert.equal(r.dairy, true);
    assert.deepEqual(r.heads['6210'], { start: 62, end: 71 });
    assert.deepEqual(r.heads['6290'], { start: 70, end: 70 });
  });

  it('2026: доход прошлого года попадает в графу «за 2025»', () => {
    const r = computeKfh1(kfhData(), 2026);
    assert.equal(r.income['1100'].cur, 30);
    assert.equal(r.income['1100'].prev, 1080);
  });
});

describe('обязательства и сроки', () => {
  it('ЛПХ, октябрь 2026: 10-СХ/1-ИП сданы, 1-ИСО-р черновик, 1-ТАБУН просрочен', () => {
    const list = buildObligations(lphCtx(), 2026);
    const byForm = Object.fromEntries(list.map((o) => [o.form_code, o]));
    assert.deepEqual(list.map((o) => o.form_code), ['10-sh', '1-ip', '1-iso-r', '1-tabun', '3-fermer-month']);
    assert.equal(byForm['10-sh'].status, 'submitted');
    assert.equal(byForm['10-sh'].receipt_no, 'УЧ-10СХ-2026-015');
    assert.equal(byForm['10-sh'].due_on, '2026-10-15');
    assert.equal(byForm['1-ip'].status, 'submitted');
    assert.equal(byForm['1-iso-r'].status, 'draft');
    assert.equal(byForm['1-iso-r'].due_on, '2026-10-30');
    assert.equal(byForm['1-tabun'].status, 'overdue');
    assert.equal(byForm['1-tabun'].due_on, '2026-10-20');
    assert.equal(byForm['1-tabun'].description, 'Табунное коневодство · 32 лошади');
    assert.equal(byForm['3-fermer-month'].status, 'submitted');
    assert.deepEqual(byForm['3-fermer-month'].period, { year: 2026, month: 9 });
  });

  it('главный экран: 2 из 3 сдано, 1 просрочен, надой 1 200 л, 15 коров и 32 лошади', () => {
    const d = buildDashboard(lphCtx());
    assert.equal(d.month_label, 'Октябрь 2026');
    assert.deepEqual(d.federal, { submitted: 2, total: 3 });
    assert.deepEqual(d.regional, { overdue: 1, total: 2 });
    assert.equal(d.milk_month_l, 1200);
    assert.deepEqual(d.household, { name: 'ЛПХ Ивановых', cows: 15, horses: 32 });
  });

  it('КФХ: годовые формы со сроками в 2026 году', () => {
    const plan = plannedObligations('kfh', 2026, TODAY);
    assert.deepEqual(plan.federal.map((p) => [p.form, p.period.year]), [
      ['3-fermer', 2025],
      ['1-fermer', 2026],
      ['2-fermer', 2026],
      ['1-kfh', 2025],
    ]);
    assert.equal(dueDate('3-fermer', { year: 2025 }, 'kfh'), '2026-01-10');
    assert.equal(dueDate('1-fermer', { year: 2026 }, 'kfh'), '2026-06-15');
    assert.equal(dueDate('2-fermer', { year: 2026 }, 'kfh'), '2026-11-21');
  });

  it('периоды месячных форм на границе года', () => {
    assert.deepEqual(currentMonthlyPeriod('10-sh', '2027-01-05'), { year: 2026, month: 12 });
    assert.equal(dueDate('10-sh', { year: 2026, month: 12 }, 'lph'), '2027-01-15');
    assert.deepEqual(currentMonthlyPeriod('1-tabun', '2027-01-05'), { year: 2027, month: 1 });
  });

  it('несданный отчёт после срока — просрочен, до срока — не начат', () => {
    const ctx: EngineCtx = { data: { ...kfhData(), farm: kfhFarm }, today: '2026-10-23' };
    assert.equal(buildObligation(ctx, '3-fermer', { year: 2025 }).status, 'overdue');
    assert.equal(buildObligation(ctx, '2-fermer', { year: 2026 }).status, 'not_started');
  });
});

describe('превью отчётов', () => {
  it('1-ТАБУН: баланс сходится', () => {
    const p = buildPreview(lphCtx(), '1-tabun', { year: 2026, month: 10 });
    assert.equal(p.sections[0].rows.at(-1)?.value, 32);
    assert.ok(p.checks[0].ok);
    assert.match(p.checks[0].label, /29 \+ 6 − 1 − 2 = 32/);
  });

  it('10-СХ: итог 25,2 т и примечание про сено от 22.10', () => {
    const p = buildPreview(lphCtx(), '10-sh', { year: 2026, month: 9 });
    assert.equal(p.sections[0].rows.at(-1)?.value, '25,2');
    assert.match(p.notes?.[0] ?? '', /2,5 т сена от 22\.10/);
    assert.equal(p.receipt?.receipt_no, 'УЧ-10СХ-2026-015');
  });

  it('1-ИП (ЛПХ-демо): работники 2, выручка 86,4 тыс. ₽', () => {
    const p = buildPreview(lphCtx(), '1-ip', { year: 2026, month: 9 });
    const rows = p.sections[1].rows;
    assert.equal(rows[1].value, 2);
    assert.equal(rows[2].value, '86,4');
  });

  it('1-ИСО-р: две проверки пройдены', () => {
    const p = buildPreview(lphCtx(), '1-iso-r', { year: 2026, month: 10 });
    assert.equal(p.checks.length, 2);
    assert.ok(p.checks.every((c) => c.ok));
    assert.match(p.checks[0].label, /15 \+ 8 \+ 32 \+ 24 = 79/);
  });

  it('3-фермер (рег) за сентябрь: 1 080 л и пояснение про текущий месяц', () => {
    const p = buildPreview(lphCtx(), '3-fermer-month', { year: 2026, month: 9 });
    const milk = p.sections[0].rows.find((r) => r.label.startsWith('Надой'));
    assert.equal(milk?.value, '1 080');
    assert.match(p.notes?.[0] ?? '', /1 200 л и 32 лошади из текущего октября/);
  });

  it('сданный отчёт берётся из снимка и не пересчитывается', () => {
    const ctx = lphCtx();
    const snap = toSnapshot(buildPreview(ctx, '10-sh', { year: 2026, month: 9 }));
    snap.sections[0].rows[0].value = 'СНИМОК';
    ctx.data.submissions[0].snapshot = snap;
    ctx.data.feed.push({ occurred_on: '2026-09-28', feed: 'hay', operation: 'harvest', quantity_t: 100 });
    const p = buildPreview(ctx, '10-sh', { year: 2026, month: 9 });
    assert.equal(p.sections[0].rows[0].value, 'СНИМОК');
  });

  it('годовые превью КФХ строятся без ошибок', () => {
    const ctx: EngineCtx = { data: kfhData(), today: TODAY };
    for (const [form, period] of [
      ['3-fermer', { year: 2025 }],
      ['1-fermer', { year: 2025 }],
      ['2-fermer', { year: 2025 }],
      ['1-kfh', { year: 2025 }],
    ] as const) {
      const p = buildPreview(ctx, form, period);
      assert.ok(p.sections.length > 0, form);
    }
  });
});

describe('куда попадут данные', () => {
  const output: NewEvent = { type: 'product_output', occurred_on: TODAY, note: null, product: 'milk', quantity: 41.2, source_group: 'cattle_cows' };
  it('надой → журнал, 3-фермер (рег) след. период, 1-ИСО-р', () => {
    const labels = getEventDestinations(output, lphFarm).map((d) => d.label);
    assert.deepEqual(labels, ['Журнал учета', '3-фермер (рег) · следующий период', 'Форма 1-ИСО-р']);
  });
  it('корма → 10-СХ', () => {
    const e: NewEvent = { type: 'feed', occurred_on: TODAY, note: null, feed: 'hay', operation: 'harvest', quantity_t: 2.5, storage_place: null };
    assert.equal(getEventDestinations(e, lphFarm)[1].form_code, '10-sh');
  });
  it('продажа продукции → Меркурий; приплод лошадей ЛПХ → 1-ТАБУН и книга', () => {
    const sale: NewEvent = { type: 'product_sale', occurred_on: TODAY, note: null, product: 'milk', quantity: 41, amount_rub: null, buyer: null, buyer_inn: null, destination: null, vehicle_number: null, mercury_status: 'draft' };
    assert.ok(getEventDestinations(sale, lphFarm).some((d) => d.kind === 'mercury'));
    const birth: NewEvent = { type: 'livestock', occurred_on: TODAY, note: null, animal_group: 'horses_young', kind: 'birth', heads: 1, live_weight_kg: null, amount_rub: null, counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null, mercury_status: 'not_required' };
    const d = getEventDestinations(birth, lphFarm);
    assert.ok(d.some((x) => x.form_code === '1-tabun'));
    assert.ok(d.some((x) => x.kind === 'household_book'));
    assert.ok(!getEventDestinations(birth, kfhFarm).some((x) => x.kind === 'household_book'));
  });
  it('растениеводство для КФХ → 1-фермер и 2-фермер', () => {
    const crop: NewEvent = { type: 'crop', occurred_on: TODAY, note: null, plot_name: 'Поле', crop: 'Картофель', operation: 'harvest', area_ha: 1, yield_t: 10 };
    const codes = getEventDestinations(crop, kfhFarm).map((d) => d.form_code);
    assert.ok(codes.includes('1-fermer') && codes.includes('2-fermer'));
  });
});
