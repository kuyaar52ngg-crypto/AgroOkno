// Сроки сдачи отчётов. Зеркало справочника public.report_deadlines (см. миграцию reference_and_fixes);
// правки из админ-панели накладываются поверх через applyDeadlineOverrides.
// Сроки 3-фермер (4–10 января), 1-фермер (до 15 июня) и 2-фермер (до 21 ноября) взяты из бланков Росстата.
// Сроки 1-КФХ/1-ИП (приказ Минсельхоза № 165) и республиканских форм Сахастата не прочитаны
// в сканах приказов (PDF без текстового слоя) — значения демонстрационные, как в макете.
import type { FormCode, IsoDate, LegalStatus, ReportAuthority, ReportPeriod } from '../data/contract';
import { addMonths, pad2 } from './period';

export interface DeadlineRule {
  form_code: FormCode;
  title: string;
  description: string;
  authority: ReportAuthority;
  recipient: string;
  scope: 'federal' | 'regional';
  /** Код формы в номере квитанции: УЧ-<код>-2026-023. */
  receipt_code: string;
  period_kind: 'year' | 'month' | 'any';
  /** Для месячных форм: отчётный период = текущий месяц + сдвиг. */
  period_shift_months: number;
  /** Месячные: срок в месяце (период + смещение). Годовые: смещение года относительно отчётного. */
  due_month_offset: number;
  due_year_offset: number;
  due_month: number | null;
  due_day: number;
  has_official_blank: boolean;
  comment: string;
}

export const DEADLINES: Record<FormCode, DeadlineRule> = {
  '3-fermer': {
    form_code: '3-fermer', title: 'Форма 3-фермер', description: 'Производство продукции животноводства и поголовье скота',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '3Ф', period_kind: 'year',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 1, due_month: 1, due_day: 10, has_official_blank: true,
    comment: 'Бланк Росстата: с 4 по 10 января после отчётного периода',
  },
  '3-fermer-month': {
    form_code: '3-fermer-month', title: 'Форма 3-фермер (рег)', description: 'Производство продукции · региональная',
    authority: 'sakhastat', recipient: 'Сахастат', scope: 'regional', receipt_code: 'ЗФР', period_kind: 'month',
    period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: null, due_day: 20, has_official_blank: true,
    comment: 'Ежемесячная версия; срок демонстрационный',
  },
  '1-fermer': {
    form_code: '1-fermer', title: 'Форма 1-фермер', description: 'Сведения об итогах сева под урожай',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '1Ф', period_kind: 'year',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: 6, due_day: 15, has_official_blank: true,
    comment: 'Бланк Росстата: с 30 апреля по 15 июня',
  },
  '2-fermer': {
    form_code: '2-fermer', title: 'Форма 2-фермер', description: 'Сведения о сборе урожая сельскохозяйственных культур',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '2Ф', period_kind: 'year',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: 11, due_day: 21, has_official_blank: true,
    comment: 'Бланк Росстата: с 13 октября по 21 ноября',
  },
  '1-kfh': {
    form_code: '1-kfh', title: 'Форма 1-КФХ', description: 'Информация о производственной деятельности глав КФХ',
    authority: 'minselhoz', recipient: 'Минсельхоз России', scope: 'federal', receipt_code: '1КФХ', period_kind: 'year',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 1, due_month: 2, due_day: 25, has_official_blank: true,
    comment: 'Срок не прочитан в скане приказа Минсельхоза № 165 — демонстрационный',
  },
  '1-ip': {
    form_code: '1-ip', title: 'Форма 1-ИП', description: 'Сведения о деятельности хозяйства',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '1ИП', period_kind: 'any',
    period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: 2, due_day: 15, has_official_blank: true,
    comment: 'Для ЛПХ — ежемесячное демо-превью (как в макете); для ИП — годовая форма Минсельхоза',
  },
  '1-tabun': {
    form_code: '1-tabun', title: 'Форма 1-ТАБУН', description: 'Табунное коневодство',
    authority: 'sakhastat', recipient: 'Сахастат', scope: 'regional', receipt_code: 'ТАБУН', period_kind: 'month',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: null, due_day: 20, has_official_blank: false,
    comment: 'Республиканская форма Сахастата, бланка нет — только превью',
  },
  '10-sh': {
    form_code: '10-sh', title: 'Форма 10-СХ', description: 'Сведения о заготовке кормов',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: '10СХ', period_kind: 'month',
    period_shift_months: -1, due_month_offset: 1, due_year_offset: 0, due_month: null, due_day: 15, has_official_blank: false,
    comment: 'Бланка нет — только превью',
  },
  '1-iso-r': {
    form_code: '1-iso-r', title: 'Форма 1-ИСО-р', description: 'Сведения о поголовье животных',
    authority: 'rosstat', recipient: 'Росстат', scope: 'federal', receipt_code: 'ИСО', period_kind: 'month',
    period_shift_months: 0, due_month_offset: 0, due_year_offset: 0, due_month: null, due_day: 30, has_official_blank: false,
    comment: 'Бланка нет — только превью',
  },
};

/** Поля справочника, которые администратор меняет в веб-панели (RPC admin_update_deadline). */
const EDITABLE = ['title', 'description', 'comment', 'due_month', 'due_day', 'due_month_offset', 'due_year_offset'] as const;
const BUILT_IN: Record<string, Pick<DeadlineRule, (typeof EDITABLE)[number]>> = Object.fromEntries(
  Object.values(DEADLINES).map((r) => [r.form_code, Object.fromEntries(EDITABLE.map((k) => [k, r[k]]))]),
) as Record<string, Pick<DeadlineRule, (typeof EDITABLE)[number]>>;

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

/**
 * Применяет строки public.report_deadlines поверх встроенных значений: так правки сроков из админ-панели
 * доходят до экрана отчётов, напоминаний и квитанций. Неизвестные формы и некорректные значения пропускаются;
 * пустой список возвращает встроенные сроки. Возвращает число изменённых форм.
 */
export function applyDeadlineOverrides(rows: readonly Record<string, unknown>[]): number {
  const byForm = new Map(rows.map((r) => [String(r.form_code), r]));
  let changed = 0;
  for (const rule of Object.values(DEADLINES)) {
    const base = BUILT_IN[rule.form_code];
    const row = byForm.get(rule.form_code);
    const next = {
      title: typeof row?.title === 'string' && row.title.trim() ? row.title : base.title,
      description: typeof row?.description === 'string' && row.description.trim() ? row.description : base.description,
      comment: typeof row?.comment === 'string' ? row.comment : base.comment,
      due_month: row && row.due_month === null ? null : (intIn(row?.due_month, 1, 12) ?? base.due_month),
      due_day: intIn(row?.due_day, 1, 31) ?? base.due_day,
      due_month_offset: intIn(row?.due_month_offset, 0, 12) ?? base.due_month_offset,
      due_year_offset: intIn(row?.due_year_offset, 0, 3) ?? base.due_year_offset,
    };
    if (EDITABLE.some((k) => rule[k] !== next[k])) {
      Object.assign(rule, next);
      changed += 1;
    }
  }
  return changed;
}

/** Какие формы и в каком порядке показываются хозяйству. */
export function formsForFarm(status: LegalStatus): { federal: FormCode[]; regional: FormCode[] } {
  if (status === 'lph') return { federal: ['10-sh', '1-ip', '1-iso-r'], regional: ['1-tabun', '3-fermer-month'] };
  const annualFederal: FormCode[] = ['3-fermer', '1-fermer', '2-fermer', status === 'ip' ? '1-ip' : '1-kfh'];
  return { federal: annualFederal, regional: ['3-fermer-month', '1-tabun'] };
}

/** Получатель и ведомство: годовая 1-ИП уходит в Минсельхоз, ежемесячное демо для ЛПХ — в Росстат (как в макете). */
export function authorityFor(form: FormCode, status: LegalStatus): { authority: ReportAuthority; recipient: string } {
  if (form === '1-ip' && status !== 'lph') return { authority: 'minselhoz', recipient: 'Минсельхоз России' };
  const rule = DEADLINES[form];
  return { authority: rule.authority, recipient: rule.recipient };
}

/** Месячная ли форма для данного статуса хозяйства (1-ИП у ЛПХ — месячная демо-версия). */
export function isMonthly(form: FormCode, status: LegalStatus): boolean {
  const kind = DEADLINES[form].period_kind;
  return kind === 'month' || (kind === 'any' && status === 'lph');
}

/** Срок сдачи за период. */
export function dueDate(form: FormCode, period: ReportPeriod, status: LegalStatus): IsoDate {
  const rule = DEADLINES[form];
  if (isMonthly(form, status) && period.month) {
    const due = addMonths(period.year, period.month, rule.due_month_offset);
    return `${due.year}-${pad2(due.month)}-${pad2(rule.due_day)}`;
  }
  const year = period.year + rule.due_year_offset;
  return `${year}-${pad2(rule.due_month ?? 1)}-${pad2(rule.due_day)}`;
}

/** Текущий отчётный период месячной формы на дату today (YYYY-MM-DD). */
export function currentMonthlyPeriod(form: FormCode, today: IsoDate): ReportPeriod {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return addMonths(year, month, DEADLINES[form].period_shift_months);
}

export interface PlannedObligation {
  form: FormCode;
  period: ReportPeriod;
}

/**
 * Обязательства хозяйства «в году year» — те, срок сдачи которых приходится на этот год.
 * Годовые формы: период = year − смещение года срока (3-фермер за 2025 сдаётся в январе 2026).
 * Месячные показываются только для текущего года (по текущему периоду каждой формы).
 */
export function plannedObligations(
  status: LegalStatus,
  year: number,
  today: IsoDate,
): { federal: PlannedObligation[]; regional: PlannedObligation[] } {
  const currentYear = Number(today.slice(0, 4));
  const plan = (form: FormCode): PlannedObligation | null => {
    if (isMonthly(form, status)) {
      if (year !== currentYear) return null;
      return { form, period: currentMonthlyPeriod(form, today) };
    }
    return { form, period: { year: year - DEADLINES[form].due_year_offset } };
  };
  const { federal, regional } = formsForFarm(status);
  const pick = (list: FormCode[]) => list.map(plan).filter((x): x is PlannedObligation => x !== null);
  return { federal: pick(federal), regional: pick(regional) };
}
