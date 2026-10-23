// Тесты ближайших сроков и просрочек (блок «Помощник», J1/J6/J8).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeDeadlineReminders, daysBetween, shortFormTitle } from '../reminders';
import { kfhData, lphData } from './fixtures';

describe('напоминания о сроках', () => {
  it('daysBetween и короткое название формы', () => {
    assert.equal(daysBetween('2026-10-23', '2026-10-30'), 7);
    assert.equal(daysBetween('2026-10-23', '2026-10-20'), -3);
    assert.equal(shortFormTitle('Форма 1-ИСО-р'), '1-ИСО-р');
  });

  it('ЛПХ на 23.10.2026: до 1-ИСО-р 7 дней, 1-ТАБУН просрочен на 3 дня (макет J1)', () => {
    const list = computeDeadlineReminders({ data: lphData(), today: '2026-10-23' });
    const iso = list.find((r) => r.form_code === '1-iso-r');
    const tabun = list.find((r) => r.form_code === '1-tabun');
    assert.ok(iso && tabun);
    assert.equal(iso.days_left, 7);
    assert.equal(iso.due_on, '2026-10-30');
    assert.equal(iso.title, '1-ИСО-р');
    assert.equal(tabun.days_left, -3);
    assert.equal(tabun.due_on, '2026-10-20');
    assert.equal(tabun.status, 'overdue');
  });

  it('порядок: ближайшие сроки по возрастанию, затем просрочки', () => {
    const list = computeDeadlineReminders({ data: lphData(), today: '2026-10-23' });
    const firstOverdue = list.findIndex((r) => r.days_left < 0);
    assert.ok(firstOverdue > 0);
    for (let i = 1; i < firstOverdue; i++) assert.ok(list[i - 1]!.days_left <= list[i]!.days_left);
    assert.ok(list.slice(firstOverdue).every((r) => r.days_left < 0));
  });

  it('сданные отчёты не напоминаются; дальние сроки не попадают в горизонт', () => {
    const list = computeDeadlineReminders({ data: kfhData(), today: '2026-10-23' }, { horizonDays: 10 });
    assert.ok(list.every((r) => r.days_left <= 10));
    assert.ok(list.every((r) => r.status !== 'submitted'));
  });
});
