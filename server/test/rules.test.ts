// Правиловый помощник: фразы из макета J1–J6 и типовые события хозяйства.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRules } from '../src/assistant/rules';
import { findNumbers, norm, parseDate } from '../src/assistant/ru';
import { litersToKg } from '../../app/src/reports/period';
import { demoContext, TODAY } from './helpers/fixtures';

const ctx = demoContext();
const ask = (text: string) => parseRules(text, ctx);

describe('числа и даты', () => {
  it('цифры и слова', () => {
    assert.equal(findNumbers(norm('120 литров'))[0]?.value, 120);
    assert.deepEqual(findNumbers(norm('сто двадцать литров')).map((n) => [n.value, n.kind]), [[120, 'liters']]);
    assert.equal(findNumbers(norm('1 200 л'))[0]?.value, 1200);
    assert.equal(findNumbers(norm('две тысячи пятьсот кг'))[0]?.value, 2500);
    assert.equal(findNumbers(norm('за 80 тысяч рублей'))[0]?.kind, 'money');
    assert.equal(findNumbers(norm('за 80 тысяч рублей'))[0]?.value, 80000);
  });
  it('даты', () => {
    assert.equal(parseDate('сегодня', TODAY), TODAY);
    assert.equal(parseDate('вчера', TODAY), '2026-10-22');
    assert.equal(parseDate('позавчера', TODAY), '2026-10-21');
    assert.equal(parseDate('20 октября', TODAY), '2026-10-20');
    assert.equal(parseDate('20.10', TODAY), '2026-10-20');
    assert.equal(parseDate('31.02', TODAY), TODAY);
  });
});

describe('J1/J2/J4 · надой', () => {
  it('«Сегодня коровы дали 120 литров молока» → событие, литры в кг (1 л = 1,03 кг)', () => {
    const r = ask('Сегодня коровы дали 120 литров молока');
    assert.equal(r.needs_clarification, false);
    assert.equal(r.proposed_events.length, 1);
    const e = r.proposed_events[0]!;
    assert.equal(e.type, 'product_output');
    if (e.type !== 'product_output') return;
    assert.equal(e.product, 'milk');
    assert.equal(e.quantity, litersToKg(120));
    assert.equal(e.occurred_on, TODAY);
    assert.equal(e.source_group, 'cattle_cows');
    assert.equal(r.text, 'Сохранил надой: 120 л за 23 октября');
  });
  it('слова вместо цифр и вчерашняя дата', () => {
    const r = ask('вчера надоили сто сорок литров');
    const e = r.proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.quantity === litersToKg(140) && e.occurred_on === '2026-10-22');
  });
  it('килограммы молока не пересчитываются', () => {
    const e = ask('надой 50 кг молока').proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.quantity === 50);
  });
});

describe('J5 · уточнение количества', () => {
  it('«Запиши надой за сегодня» → вопрос, событий нет', () => {
    const r = ask('Запиши надой за сегодня');
    assert.equal(r.needs_clarification, true);
    assert.equal(r.proposed_events.length, 0);
    assert.match(r.text, /Сколько литров молока получили сегодня\?/);
    assert.match(r.text, /Пока ничего не сохранил/);
  });
});

describe('J6 · ответ по отчётам', () => {
  it('«Какие отчеты скоро сдавать?» → карточки сроков и памятка', () => {
    const r = ask('Какие отчеты скоро сдавать?');
    const cards = r.cards ?? [];
    const deadlines = cards.filter((c) => c.kind === 'deadline');
    assert.ok(deadlines.length >= 2);
    assert.ok(deadlines.some((c) => c.kind === 'deadline' && c.reminder.form_code === '1-iso-r' && c.reminder.days_left === 7));
    assert.ok(deadlines.some((c) => c.kind === 'deadline' && c.reminder.form_code === '1-tabun' && c.reminder.days_left === -3));
    const howTo = cards.find((c) => c.kind === 'how_to');
    assert.ok(howTo && howTo.kind === 'how_to' && howTo.steps.length === 3);
    assert.match(r.text, /Помощник не отправляет отчеты за вас/);
    assert.equal(r.proposed_events.length, 0);
  });
  it('«Какие отчеты мне нужно сдать до конца октября?»', () => {
    const r = ask('Какие отчеты мне нужно сдать до конца октября?');
    assert.ok((r.cards ?? []).some((c) => c.kind === 'deadline'));
  });
  it('«Как проверить отчет?» → памятка', () => {
    const r = ask('Как проверить отчет?');
    assert.deepEqual((r.cards ?? []).map((c) => c.kind), ['how_to']);
  });
});

describe('приплод, падёж, забой, продажа', () => {
  it('«Отелилась корова» → 1 теленок', () => {
    const e = ask('Сегодня отелилась корова').proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.kind === 'birth' && e.animal_group === 'cattle_calves' && e.heads === 1);
  });
  it('«Родилось 6 жеребят» → молодняк лошадей', () => {
    const e = ask('Родилось 6 жеребят').proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.kind === 'birth' && e.animal_group === 'horses_young' && e.heads === 6);
  });
  it('«Пала кобыла вчера» → падёж 1 гол', () => {
    const e = ask('Пала кобыла вчера').proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.kind === 'death' && e.animal_group === 'horses_mares' && e.heads === 1 && e.occurred_on === '2026-10-22');
  });
  it('«Забили 2 жеребенка» → забой молодняка', () => {
    const e = ask('Забили 2 жеребенка').proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.kind === 'slaughter' && e.animal_group === 'horses_young' && e.heads === 2);
  });
  it('«Продали 2 бычка за 80 тысяч рублей» → продажа с суммой', () => {
    const e = ask('Продали 2 бычка за 80 тысяч рублей').proposed_events[0]!;
    assert.ok(e.type === 'livestock' && e.kind === 'sale' && e.heads === 2 && e.amount_rub === 80000);
  });
  it('нет количества → уточнение', () => {
    const r = ask('Забили овец');
    assert.equal(r.needs_clarification, true);
    assert.equal(r.proposed_events.length, 0);
  });
  it('нет животного → уточнение', () => {
    assert.equal(ask('Родилось 3').needs_clarification, true);
  });
});

describe('продукция и корма', () => {
  it('«Продали 50 литров молока за 4000 рублей» → product_sale', () => {
    const e = ask('Продали 50 литров молока за 4000 рублей').proposed_events[0]!;
    assert.ok(e.type === 'product_sale' && e.product === 'milk' && e.quantity === litersToKg(50) && e.amount_rub === 4000);
  });
  it('«Собрали 200 яиц» → product_output eggs', () => {
    const e = ask('Собрали 200 яиц').proposed_events[0]!;
    assert.ok(e.type === 'product_output' && e.product === 'eggs' && e.quantity === 200);
  });
  it('«Заготовили 30 тонн сена» → feed harvest', () => {
    const e = ask('Заготовили 30 тонн сена').proposed_events[0]!;
    assert.ok(e.type === 'feed' && e.feed === 'hay' && e.operation === 'harvest' && e.quantity_t === 30);
  });
});

describe('прочее', () => {
  it('непонятная фраза → подсказка, ничего не сохраняется', () => {
    const r = ask('Какая сегодня погода');
    assert.equal(r.proposed_events.length, 0);
    assert.match(r.text, /надой/);
  });
  it('пустой текст → справка', () => {
    assert.match(ask('   ').text, /отчетами/);
  });
});
