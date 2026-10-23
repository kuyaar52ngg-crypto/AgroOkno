// Форма 10-СХ: «Сведения о заготовке кормов». Бланка нет — превью в приложении.
// Заготовка кормов по видам за месяц, натуральный вес, тонн.
import { inRange, monthEnd, monthStart, round1 } from './period';
import type { FarmData, FeedKind } from './types';

export interface Sh10Result {
  hay: number;
  haylage: number;
  silage: number;
  grain: number;
  other: number;
  /** Всего, натуральный вес, т. */
  total: number;
}

export function computeSh10(data: FarmData, period: { year: number; month: number }): Sh10Result {
  const range = { from: monthStart(period.year, period.month), to: monthEnd(period.year, period.month) };
  const sum = (kind: FeedKind) =>
    data.feed
      .filter((f) => f.operation === 'harvest' && f.feed === kind && inRange(f.occurred_on, range))
      .reduce((s, f) => s + f.quantity_t, 0);
  const hay = round1(sum('hay'));
  const haylage = round1(sum('haylage'));
  const silage = round1(sum('silage'));
  const grain = round1(sum('grain'));
  const other = round1(sum('other'));
  return { hay, haylage, silage, grain, other, total: round1(hay + haylage + silage + grain + other) };
}
