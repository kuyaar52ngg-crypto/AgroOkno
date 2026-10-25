// Сроки отчётов: человекочитаемое описание и проверка формы редактирования.
import type { DeadlinePatch, ReportDeadline } from '../api/types';
import { monthNameGenitive } from './format';

type DeadlineShape = Pick<ReportDeadline, 'period_kind' | 'due_month' | 'due_day' | 'due_month_offset' | 'due_year_offset'>;

const yearOffsetText = (n: number): string => {
  if (n === 0) return 'отчётного года';
  if (n === 1) return 'следующего года';
  if (n === -1) return 'предыдущего года';
  return `года ${n > 0 ? '+' : '−'}${Math.abs(n)} от отчётного`;
};

const monthOffsetText = (n: number): string => {
  if (n === 0) return 'отчётного месяца';
  if (n === 1) return 'следующего месяца';
  if (n === -1) return 'предыдущего месяца';
  return `месяца ${n > 0 ? '+' : '−'}${Math.abs(n)} от отчётного`;
};

/** «до 10 января следующего года» / «до 20 числа следующего месяца». */
export function describeDeadline(d: DeadlineShape): string {
  const yearly = d.period_kind === 'year' || (d.period_kind === 'any' && d.due_month !== null);
  if (yearly && d.due_month !== null) {
    return `до ${d.due_day} ${monthNameGenitive(d.due_month)} ${yearOffsetText(d.due_year_offset)}`;
  }
  return `до ${d.due_day} числа ${monthOffsetText(d.due_month_offset)}`;
}

/** Значения полей формы — строки (как в <input>). */
export interface DeadlineDraft {
  title: string;
  description: string;
  comment: string;
  due_month: string;
  due_day: string;
  due_month_offset: string;
  due_year_offset: string;
}

export type DeadlineErrors = Partial<Record<keyof DeadlineDraft, string>>;

export function toDraft(d: ReportDeadline): DeadlineDraft {
  return {
    title: d.title,
    description: d.description,
    comment: d.comment ?? '',
    due_month: d.due_month === null ? '' : String(d.due_month),
    due_day: String(d.due_day),
    due_month_offset: String(d.due_month_offset),
    due_year_offset: String(d.due_year_offset),
  };
}

const isInt = (s: string) => /^-?\d+$/.test(s.trim());

/** Проверка диапазонов (те же, что в RPC admin_update_deadline): день 1–31, месяц 1–12, смещение месяца 0–12, смещение года 0–3. */
export function validateDraft(draft: DeadlineDraft, original: Pick<ReportDeadline, 'period_kind'>): DeadlineErrors {
  const errors: DeadlineErrors = {};
  if (draft.title.trim() === '') errors.title = 'Укажите название';
  else if (draft.title.length > 200) errors.title = 'Не длиннее 200 символов';
  if (draft.description.trim() === '') errors.description = 'Укажите описание';
  else if (draft.description.length > 500) errors.description = 'Не длиннее 500 символов';
  if (draft.comment.length > 500) errors.comment = 'Не длиннее 500 символов';

  if (!isInt(draft.due_day) || Number(draft.due_day) < 1 || Number(draft.due_day) > 31) errors.due_day = 'Число от 1 до 31';
  if (draft.due_month.trim() === '') {
    if (original.period_kind === 'year') errors.due_month = 'Для годовой формы нужен месяц (1–12)';
  } else if (!isInt(draft.due_month) || Number(draft.due_month) < 1 || Number(draft.due_month) > 12) {
    errors.due_month = 'Число от 1 до 12';
  }
  if (!isInt(draft.due_month_offset) || Number(draft.due_month_offset) < 0 || Number(draft.due_month_offset) > 12) errors.due_month_offset = 'Целое число от 0 до 12';
  if (!isInt(draft.due_year_offset) || Number(draft.due_year_offset) < 0 || Number(draft.due_year_offset) > 3) errors.due_year_offset = 'Целое число от 0 до 3';
  return errors;
}

/** Только изменившиеся поля — в формате `p_patch` RPC admin_update_deadline. */
export function buildPatch(draft: DeadlineDraft, original: ReportDeadline): DeadlinePatch {
  const patch: DeadlinePatch = {};
  if (draft.title.trim() !== original.title) patch.title = draft.title.trim();
  if (draft.description.trim() !== original.description) patch.description = draft.description.trim();
  const comment = draft.comment.trim() === '' ? null : draft.comment.trim();
  if (comment !== (original.comment ?? null)) patch.comment = comment;
  const month = draft.due_month.trim() === '' ? null : Number(draft.due_month);
  if (month !== original.due_month) patch.due_month = month;
  if (Number(draft.due_day) !== original.due_day) patch.due_day = Number(draft.due_day);
  if (Number(draft.due_month_offset) !== original.due_month_offset) patch.due_month_offset = Number(draft.due_month_offset);
  if (Number(draft.due_year_offset) !== original.due_year_offset) patch.due_year_offset = Number(draft.due_year_offset);
  return patch;
}
