// Форма № 1-фермер (Росстат, приказ от 30.01.2025 № 34): «Сведения об итогах сева под урожай», гектар.
// Номера строк — по бланку «Росстат 1-фермер.XLSX» (лист «стр.2_3», графа 1 «За отчетный год»).
import { classifyCrop, isWinterCrop } from './crops';
import { inRange, round2 } from './period';
import type { FarmData } from './types';

export interface Fermer1Result {
  /** Ключ — номер строки формы (1…28), значение — площадь, га. */
  lines: Record<string, number>;
}

export function computeFermer1(data: FarmData, year: number): Fermer1Result {
  const lines: Record<string, number> = {};
  const add = (line: number, ha: number) => {
    lines[String(line)] = (lines[String(line)] ?? 0) + ha;
  };

  for (const row of data.crops) {
    if (row.operation !== 'sowing') continue;
    const cat = classifyCrop(row.crop);
    const winter = isWinterCrop(row.crop);
    const date = row.occurred_on;

    // Озимые, посеянные осенью прошлого года, — строки 1–3 (на зерно — 2/3).
    if (winter) {
      if (inRange(date, { from: `${year - 1}-07-01`, to: `${year - 1}-12-31` })) {
        add(1, row.area_ha);
        const grain = cat === 'wheat_winter' || cat === 'rye' || cat === 'barley' || cat === 'grain_other';
        if (grain) add(cat === 'wheat_winter' ? 2 : 3, row.area_ha);
      }
      continue;
    }
    if (!inRange(date, { from: `${year}-01-01`, to: `${year}-12-31` })) continue;

    switch (cat) {
      case 'wheat_spring':
        add(8, row.area_ha);
        break;
      case 'barley':
      case 'oats':
      case 'buckwheat':
      case 'rye':
      case 'legumes':
      case 'grain_other':
        add(9, row.area_ha);
        break;
      case 'sunflower':
        add(11, row.area_ha);
        break;
      case 'rapeseed':
        add(12, row.area_ha);
        break;
      case 'sugar_beet':
        add(14, row.area_ha);
        break;
      case 'flax':
        add(15, row.area_ha);
        break;
      case 'soy':
        add(16, row.area_ha);
        break;
      case 'potato':
        add(18, row.area_ha);
        break;
      case 'vegetables':
        add(19, row.area_ha);
        break;
      case 'melons':
        add(21, row.area_ha);
        break;
      case 'grass_perennial':
        add(24, row.area_ha);
        break;
      case 'corn_fodder':
      case 'grass_annual':
      case 'fodder_root':
      case 'fodder_other':
        add(23, row.area_ha);
        break;
      default:
        break;
    }
  }

  const g = (n: number) => lines[String(n)] ?? 0;
  // Итоговые строки.
  lines['7'] = g(1); // сохранилось озимых (потерь не учитываем)
  lines['10'] = g(8) + g(9);
  lines['17'] = g(11) + g(12) + g(13) + g(14) + g(15) + g(16);
  lines['20'] = g(19);
  lines['25'] = g(23) + g(24);
  lines['26'] = g(7) + g(10) + g(17) + g(18) + g(20) + g(21) + g(25);

  for (const key of Object.keys(lines)) {
    lines[key] = round2(lines[key]);
    if (!lines[key]) delete lines[key];
  }
  return { lines };
}

/** Строка бланка (лист «стр.2_3») для каждой номера строки формы. Значение — в колонке DX. */
export const FERMER1_SHEET_ROW: Record<number, number> = {
  1: 5, 2: 6, 3: 8, 4: 10, 5: 12, 6: 13, 7: 14, 8: 17, 9: 20, 10: 22, 11: 23, 12: 25, 13: 26, 14: 27,
  15: 28, 16: 29, 17: 30, 18: 31, 19: 34, 20: 36, 21: 37, 22: 41, 23: 44, 24: 46, 25: 47, 26: 48, 27: 50, 28: 52,
};
