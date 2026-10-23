// Границы отчётных периодов и подсчёт поголовья. Даты — строки YYYY-MM-DD (сравнение лексикографическое).
import type { ReportPeriod } from '../data/contract';
import type { LivestockGroup, MovementKind, MovementRow } from './types';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const monthStart = (year: number, month: number) => `${year}-${pad2(month)}-01`;
export const monthEnd = (year: number, month: number) => `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;

export interface DateRange {
  from: string;
  to: string;
}

export function periodRange(period: ReportPeriod): DateRange {
  if (period.month) return { from: monthStart(period.year, period.month), to: monthEnd(period.year, period.month) };
  return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
}

export const inRange = (date: string, range: DateRange) => date >= range.from && date <= range.to;

/** Сдвиг месяца: addMonths(2026, 1, -1) → { year: 2025, month: 12 }. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** День до указанной даты. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const INCOMING_KINDS: readonly MovementKind[] = ['opening_balance', 'birth', 'purchase', 'transfer_in'];

/** +1 для прихода, −1 для расхода (как movement_sign в БД). */
export const movementSign = (kind: MovementKind): 1 | -1 => (INCOMING_KINDS.includes(kind) ? 1 : -1);

/** Поголовье по группам на дату включительно. */
export function balanceOn(movements: MovementRow[], on: string): Partial<Record<LivestockGroup, number>> {
  const result: Partial<Record<LivestockGroup, number>> = {};
  for (const m of movements) {
    if (m.occurred_on > on) continue;
    result[m.animal_group] = (result[m.animal_group] ?? 0) + movementSign(m.kind) * m.heads;
  }
  for (const key of Object.keys(result) as LivestockGroup[]) result[key] = Math.max(0, result[key] ?? 0);
  return result;
}

export const sumHeads = (balance: Partial<Record<LivestockGroup, number>>, groups?: readonly LivestockGroup[]) =>
  (Object.entries(balance) as [LivestockGroup, number][])
    .filter(([g]) => !groups || groups.includes(g))
    .reduce((s, [, n]) => s + n, 0);

export const CATTLE: readonly LivestockGroup[] = ['cattle_cows', 'cattle_calves', 'cattle_other'];
export const PIGS: readonly LivestockGroup[] = ['pigs_sows', 'pigs_other'];
export const HORSES: readonly LivestockGroup[] = ['horses_mares', 'horses_young', 'horses_stallions', 'horses_other'];
export const SHEEP_GOATS: readonly LivestockGroup[] = ['sheep', 'goats'];

export const ALL_GROUPS: readonly LivestockGroup[] = [
  'cattle_cows',
  'cattle_calves',
  'cattle_other',
  'pigs_sows',
  'pigs_other',
  'sheep',
  'goats',
  'horses_mares',
  'horses_young',
  'horses_stallions',
  'horses_other',
  'deer',
  'poultry',
  'rabbits',
];

/** кг → центнеры, с округлением до 0,1 как принято в формах Росстата. */
export const toCentners = (kg: number) => Math.round(kg / 10) / 10;
/** шт → тыс. шт, с точностью 0,1. */
export const toThousands = (pcs: number) => Math.round(pcs / 100) / 10;
/** тонны → центнеры. */
export const tonsToCentners = (t: number) => Math.round(t * 100 * 10) / 10;
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const MILK_KG_PER_LITER = 1.03;
export const kgToLiters = (kg: number) => Math.round(kg / MILK_KG_PER_LITER);
export const litersToKg = (l: number) => Math.round(l * MILK_KG_PER_LITER * 1000) / 1000;
