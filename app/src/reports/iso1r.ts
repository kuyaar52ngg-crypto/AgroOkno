// Форма 1-ИСО-р: «Сведения о поголовье животных». Бланка нет — превью в приложении.
// Поголовье по группам на отчётную дату + проверки «сумма по группам» и «совпадает с книгой ЛПХ».
import type { LivestockGroup } from '../data/contract';
import { ALL_GROUPS, balanceOn, HORSES, PIGS, sumHeads } from './period';
import type { MovementRow } from './types';

export interface Iso1rResult {
  on: string;
  cows: number;
  calves: number;
  cattleOther: number;
  horses: number;
  sheep: number;
  goats: number;
  pigs: number;
  deer: number;
  poultry: number;
  rabbits: number;
  total: number;
  /** Сумма голов по перечисленным группам. */
  groupSum: number;
}

export function computeIso1r(movements: MovementRow[], on: string): Iso1rResult {
  const b = balanceOn(movements, on);
  const g = (group: LivestockGroup) => b[group] ?? 0;
  const result = {
    on,
    cows: g('cattle_cows'),
    calves: g('cattle_calves'),
    cattleOther: g('cattle_other'),
    horses: sumHeads(b, HORSES),
    sheep: g('sheep'),
    goats: g('goats'),
    pigs: sumHeads(b, PIGS),
    deer: g('deer'),
    poultry: g('poultry'),
    rabbits: g('rabbits'),
    total: sumHeads(b, ALL_GROUPS),
    groupSum: 0,
  };
  result.groupSum =
    result.cows + result.calves + result.cattleOther + result.horses + result.sheep + result.goats +
    result.pigs + result.deer + result.poultry + result.rabbits;
  return result;
}
