import { describe, expect, it } from 'vitest';

import type { ReportDeadline } from '../api/types';
import { buildPatch, describeDeadline, toDraft, validateDraft } from './deadlines';

const annual: ReportDeadline = {
  form_code: '3-fermer',
  title: 'Форма 3-фермер',
  description: 'Производство продукции животноводства',
  authority: 'rosstat',
  recipient: 'Росстат',
  scope: 'federal',
  receipt_code: '3Ф',
  period_kind: 'year',
  period_shift_months: 0,
  due_month_offset: 0,
  due_year_offset: 1,
  due_month: 1,
  due_day: 10,
  has_official_blank: true,
  comment: 'Бланк Росстата',
};

const monthly: ReportDeadline = { ...annual, form_code: '1-tabun', period_kind: 'month', due_month: null, due_day: 20, due_month_offset: 1, due_year_offset: 0, comment: null };

describe('описание срока', () => {
  it('годовая форма', () => {
    expect(describeDeadline(annual)).toBe('до 10 января следующего года');
    expect(describeDeadline({ ...annual, due_month: 6, due_day: 15, due_year_offset: 0 })).toBe('до 15 июня отчётного года');
    expect(describeDeadline({ ...annual, due_year_offset: -1 })).toBe('до 10 января предыдущего года');
    expect(describeDeadline({ ...annual, due_year_offset: 2 })).toBe('до 10 января года +2 от отчётного');
  });

  it('месячная форма', () => {
    expect(describeDeadline(monthly)).toBe('до 20 числа следующего месяца');
    expect(describeDeadline({ ...monthly, due_month_offset: 0 })).toBe('до 20 числа отчётного месяца');
    expect(describeDeadline({ ...monthly, due_month_offset: -1 })).toBe('до 20 числа предыдущего месяца');
  });

  it('форма «any»: с месяцем — годовая, без — месячная', () => {
    expect(describeDeadline({ ...annual, period_kind: 'any', due_month: 2, due_day: 15, due_year_offset: 0 })).toBe('до 15 февраля отчётного года');
    expect(describeDeadline({ ...monthly, period_kind: 'any' })).toBe('до 20 числа следующего месяца');
  });
});

describe('форма редактирования срока', () => {
  it('toDraft переводит значения в строки', () => {
    expect(toDraft(annual)).toEqual({
      title: 'Форма 3-фермер',
      description: 'Производство продукции животноводства',
      comment: 'Бланк Росстата',
      due_month: '1',
      due_day: '10',
      due_month_offset: '0',
      due_year_offset: '1',
    });
    expect(toDraft(monthly).due_month).toBe('');
    expect(toDraft(monthly).comment).toBe('');
  });

  it('исходные значения валидны', () => {
    expect(validateDraft(toDraft(annual), annual)).toEqual({});
    expect(validateDraft(toDraft(monthly), monthly)).toEqual({});
  });

  it('диапазоны и обязательные поля', () => {
    const base = toDraft(annual);
    expect(validateDraft({ ...base, due_day: '0' }, annual).due_day).toBeDefined();
    expect(validateDraft({ ...base, due_day: '32' }, annual).due_day).toBeDefined();
    expect(validateDraft({ ...base, due_day: 'abc' }, annual).due_day).toBeDefined();
    expect(validateDraft({ ...base, due_day: '31' }, annual).due_day).toBeUndefined();
    expect(validateDraft({ ...base, due_month: '13' }, annual).due_month).toBeDefined();
    expect(validateDraft({ ...base, due_month: '' }, annual).due_month).toBeDefined(); // годовой без месяца
    expect(validateDraft({ ...toDraft(monthly), due_month: '' }, monthly).due_month).toBeUndefined();
    expect(validateDraft({ ...base, due_month_offset: '13' }, annual).due_month_offset).toBeDefined();
    expect(validateDraft({ ...base, due_month_offset: '-1' }, annual).due_month_offset).toBeDefined();
    expect(validateDraft({ ...base, due_month_offset: '12' }, annual).due_month_offset).toBeUndefined();
    expect(validateDraft({ ...base, due_month_offset: '0' }, annual).due_month_offset).toBeUndefined();
    expect(validateDraft({ ...base, due_year_offset: '4' }, annual).due_year_offset).toBeDefined();
    expect(validateDraft({ ...base, due_year_offset: '-1' }, annual).due_year_offset).toBeDefined();
    expect(validateDraft({ ...base, due_year_offset: '3' }, annual).due_year_offset).toBeUndefined();
    expect(validateDraft({ ...base, title: '  ' }, annual).title).toBeDefined();
    expect(validateDraft({ ...base, description: '' }, annual).description).toBeDefined();
    expect(validateDraft({ ...base, comment: 'x'.repeat(501) }, annual).comment).toBeDefined();
  });

  it('buildPatch содержит только изменённые поля', () => {
    expect(buildPatch(toDraft(annual), annual)).toEqual({});
    expect(buildPatch({ ...toDraft(annual), due_day: '12', title: ' Новое название ' }, annual)).toEqual({ due_day: 12, title: 'Новое название' });
  });

  it('buildPatch: пустой комментарий → null, пустой месяц → null', () => {
    expect(buildPatch({ ...toDraft(annual), comment: '   ' }, annual)).toEqual({ comment: null });
    expect(buildPatch({ ...toDraft(monthly), due_month: '5' }, monthly)).toEqual({ due_month: 5 });
    expect(buildPatch({ ...toDraft(annual), due_month: '' }, annual)).toEqual({ due_month: null });
    expect(buildPatch({ ...toDraft(monthly), comment: '' }, monthly)).toEqual({});
  });
});
