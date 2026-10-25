// Сроки из справочника report_deadlines (правки админ-панели) поверх встроенных.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { applyDeadlineOverrides, DEADLINES, dueDate } from '../deadlines';

describe('applyDeadlineOverrides', () => {
  afterEach(() => applyDeadlineOverrides([]));

  it('меняет срок и название формы, остальные формы не трогает', () => {
    const changed = applyDeadlineOverrides([{ form_code: '3-fermer', title: 'Форма 3-фермер (новая)', due_month: 2, due_day: 1, due_year_offset: 1 }]);
    assert.equal(changed, 1);
    assert.equal(DEADLINES['3-fermer'].title, 'Форма 3-фермер (новая)');
    assert.equal(dueDate('3-fermer', { year: 2026 }, 'kfh'), '2027-02-01');
    assert.equal(dueDate('1-fermer', { year: 2026 }, 'kfh'), '2026-06-15');
  });

  it('пустой список возвращает встроенные сроки, мусор игнорируется', () => {
    applyDeadlineOverrides([{ form_code: '3-fermer', due_day: 25 }]);
    assert.equal(DEADLINES['3-fermer'].due_day, 25);
    applyDeadlineOverrides([]);
    assert.equal(DEADLINES['3-fermer'].due_day, 10);
    applyDeadlineOverrides([{ form_code: '3-fermer', due_day: 99, title: '' }, { form_code: 'unknown', due_day: 1 }]);
    assert.equal(DEADLINES['3-fermer'].due_day, 10);
    assert.equal(DEADLINES['3-fermer'].title, 'Форма 3-фермер');
  });

  it('месячная форма: день срока из справочника', () => {
    applyDeadlineOverrides([{ form_code: '10-sh', due_day: 5, due_month: null }]);
    assert.equal(dueDate('10-sh', { year: 2026, month: 10 }, 'lph'), '2026-11-05');
  });
});
