// Ближайшие сроки и просрочки отчётов (блок «Помощник», карточки чата J1/J6, напоминания J8).
// Чистый TS без зависимостей от React Native: работает офлайн в приложении и на сервере (cron, помощник).
import type { DeadlineReminder, FormCode, ReportObligation } from '../data/contract';
import { buildObligations, type EngineCtx } from './engine';

export interface ReminderOptions {
  /** Сколько дней вперёд показывать (по умолчанию 45). */
  horizonDays?: number;
  /** Сколько дней просрочки ещё показывать (по умолчанию 120). */
  overdueDays?: number;
}

const DAY_MS = 86_400_000;

/** Разница в днях между датами YYYY-MM-DD (to − from). */
export function daysBetween(from: string, to: string): number {
  const f = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const t = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((t - f) / DAY_MS);
}

/** «Форма 1-ИСО-р» → «1-ИСО-р». */
export const shortFormTitle = (title: string): string => title.replace(/^Форма\s+/i, '');

export function periodKey(o: Pick<ReportObligation, 'period'>): string {
  return o.period.month ? `${o.period.year}-${String(o.period.month).padStart(2, '0')}` : String(o.period.year);
}

/** Невыполненные обязательства (не сданы) с остатком дней до срока. Ближайшие сроки — первыми, затем просрочки. */
export function computeReminderObligations(
  ctx: EngineCtx,
  options: ReminderOptions = {},
): { obligation: ReportObligation; days_left: number }[] {
  const horizon = options.horizonDays ?? 45;
  const overdueLimit = options.overdueDays ?? 120;
  const year = Number(ctx.today.slice(0, 4));
  const seen = new Set<string>();
  const out: { obligation: ReportObligation; days_left: number }[] = [];
  for (const y of [year, year + 1]) {
    for (const o of buildObligations(ctx, y)) {
      const key = `${o.form_code}:${periodKey(o)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (o.status === 'submitted') continue;
      const days_left = daysBetween(ctx.today, o.due_on);
      if (days_left > horizon || days_left < -overdueLimit) continue;
      out.push({ obligation: o, days_left });
    }
  }
  return out.sort((a, b) => {
    const aOver = a.days_left < 0;
    const bOver = b.days_left < 0;
    if (aOver !== bOver) return aOver ? 1 : -1;
    return aOver ? b.days_left - a.days_left : a.days_left - b.days_left;
  });
}

export function computeDeadlineReminders(ctx: EngineCtx, options: ReminderOptions = {}): DeadlineReminder[] {
  return computeReminderObligations(ctx, options).map(({ obligation: o, days_left }) => ({
    form_code: o.form_code as FormCode,
    title: shortFormTitle(o.title),
    due_on: o.due_on,
    days_left,
    status: o.status,
  }));
}
