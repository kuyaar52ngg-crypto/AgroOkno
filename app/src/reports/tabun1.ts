// Форма 1-ТАБУН (республиканская, Сахастат). Официального бланка нет — только превью в приложении.
// Движение табуна за месяц и состав табуна на конец месяца.
import type { HorseHerd } from '../data/contract';
import { balanceOn, dayBefore, HORSES, inRange, monthEnd, monthStart, sumHeads } from './period';
import type { FarmData, MovementRow } from './types';

const isHorse = (m: MovementRow) => HORSES.includes(m.animal_group);

export function computeTabun1(data: FarmData, period: { year: number; month: number }): HorseHerd {
  const range = { from: monthStart(period.year, period.month), to: monthEnd(period.year, period.month) };
  const horse = data.movements.filter(isHorse);
  const inMonth = horse.filter((m) => inRange(m.occurred_on, range));
  const sumKind = (kinds: string[]) => inMonth.filter((m) => kinds.includes(m.kind)).reduce((s, m) => s + m.heads, 0);

  const opening = sumHeads(balanceOn(horse, dayBefore(range.from)), HORSES) + sumKind(['opening_balance']);
  const end = balanceOn(horse, range.to);
  return {
    period,
    total: sumHeads(end, HORSES),
    mares: end.horses_mares ?? 0,
    young: end.horses_young ?? 0,
    stallions: end.horses_stallions ?? 0,
    opening,
    born: sumKind(['birth']),
    died: sumKind(['death']),
    slaughtered: sumKind(['slaughter', 'sale_slaughter']),
    sold: sumKind(['sale']),
    purchased: sumKind(['purchase']),
  };
}

/** Баланс: «29 + 6 − 1 − 2 = 32». Продажа и покупка включаются в формулу только если были. */
export function tabunBalance(h: HorseHerd): { formula: string; ok: boolean } {
  const parts = [String(h.opening)];
  if (h.born) parts.push(`+ ${h.born}`);
  if (h.purchased) parts.push(`+ ${h.purchased}`);
  if (h.died) parts.push(`− ${h.died}`);
  if (h.slaughtered) parts.push(`− ${h.slaughtered}`);
  if (h.sold) parts.push(`− ${h.sold}`);
  const calc = h.opening + h.born + h.purchased - h.died - h.slaughtered - h.sold;
  return { formula: `${parts.join(' ')} = ${h.total}`, ok: calc === h.total && h.mares + h.young + h.stallions <= h.total };
}
