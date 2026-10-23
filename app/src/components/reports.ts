import { daysBetween, daysWord, fmtDate, fmtDateLong, monthName, todayIso } from '@/constants/format';
import { AUTHORITY_LABEL, FORM_SHORT } from '@/constants/labels';
import { useReports } from '@/data';
import type { FormCode, ReportObligation, ReportPeriod } from '@/data/contract';

export const FORM_CODES: FormCode[] = ['3-fermer', '3-fermer-month', '1-fermer', '2-fermer', '1-kfh', '1-ip', '1-tabun', '10-sh', '1-iso-r'];

export function isFormCode(value: string | undefined): value is FormCode {
  return value !== undefined && (FORM_CODES as string[]).includes(value);
}

export function shortName(form: FormCode): string {
  return FORM_SHORT[form];
}

export function periodText(period: ReportPeriod): string {
  return period.month ? `${monthName(period.month)} ${period.year}` : `${period.year} год`;
}

/** Строка срока для списка отчётов («Сдан 15 октября 2026 · Росстат»). */
export function obligationMeta(o: ReportObligation): string {
  const authority = AUTHORITY_LABEL[o.authority];
  if (o.status === 'submitted') {
    return `Сдан ${fmtDateLong(o.submitted_at?.slice(0, 10) ?? o.due_on)} · ${authority}`;
  }
  if (o.status === 'overdue') {
    const days = Math.max(daysBetween(o.due_on, todayIso()), 0);
    return `Срок был ${fmtDateLong(o.due_on)} · на ${days} ${daysWord(days)}`;
  }
  return `Срок до ${fmtDateLong(o.due_on)} · ${authority}`;
}

/** Три строки шапки превью: период, срок/статус, субъект. */
export function previewHeaderLines(o: ReportObligation, respondent: string): string[] {
  const authority = AUTHORITY_LABEL[o.authority];
  const today = fmtDate(todayIso());
  const period = periodText(o.period);
  if (o.status === 'submitted') {
    return [`${period} · ${o.form_code === '1-ip' ? 'учебный период' : 'предыдущий период'}`, `Сдан ${fmtDate(o.submitted_at?.slice(0, 10))} · ${authority}`, respondent];
  }
  if (o.status === 'overdue') {
    const days = Math.max(daysBetween(o.due_on, todayIso()), 0);
    return [`${period} · на ${today}`, `${authority} · срок ${fmtDate(o.due_on)} · на ${days} ${daysWord(days)}`, respondent];
  }
  return [`${period} · на ${today}`, `${authority} · срок до ${fmtDate(o.due_on)}`, respondent];
}

/** Обязательство по коду формы: период берём из списка отчётов (или из параметров маршрута). */
export function useObligation(form: FormCode, year?: number) {
  const y = year ?? Number(todayIso().slice(0, 4));
  const reports = useReports(y);
  const obligation = (reports.data ?? []).find((o) => o.form_code === form) ?? null;
  const period: ReportPeriod = obligation?.period ?? { year: y };
  return { reports, obligation, period };
}
