// Классификация культур по названию (в событиях растениеводства культура — свободный текст:
// «Картофель», «Овощи открытого грунта», «Ячмень яровой»…) и свёртка по годам.
import { inRange, type DateRange } from './period';
import type { CropRow } from './types';

export type CropCategory =
  | 'wheat_winter'
  | 'wheat_spring'
  | 'barley'
  | 'oats'
  | 'buckwheat'
  | 'rye'
  | 'legumes'
  | 'grain_other'
  | 'sunflower'
  | 'soy'
  | 'rapeseed'
  | 'flax'
  | 'sugar_beet'
  | 'potato'
  | 'vegetables'
  | 'melons'
  | 'fodder_root'
  | 'corn_fodder'
  | 'grass_annual'
  | 'grass_perennial'
  | 'fodder_other'
  | 'other';

export const GRAIN_CATEGORIES: readonly CropCategory[] = [
  'wheat_winter',
  'wheat_spring',
  'barley',
  'oats',
  'buckwheat',
  'rye',
  'legumes',
  'grain_other',
];
export const TECHNICAL_CATEGORIES: readonly CropCategory[] = ['sunflower', 'soy', 'rapeseed', 'flax', 'sugar_beet'];
export const FODDER_CATEGORIES: readonly CropCategory[] = [
  'fodder_root',
  'corn_fodder',
  'grass_annual',
  'grass_perennial',
  'fodder_other',
];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function classifyCrop(name: string): CropCategory {
  const n = norm(name);
  if (/картоф/.test(n)) return 'potato';
  if (/сахарн/.test(n)) return 'sugar_beet';
  if (/бахч|арбуз|дын[яи]/.test(n)) return 'melons';
  if (/озим/.test(n) && /пшениц/.test(n)) return 'wheat_winter';
  if (/пшениц/.test(n)) return 'wheat_spring';
  if (/ячмен/.test(n)) return 'barley';
  if (/(^|\s)овес|овса/.test(n)) return 'oats';
  if (/гречих/.test(n)) return 'buckwheat';
  if (/(^|\s)рож|(^|\s)рожь/.test(n)) return 'rye';
  if (/горох|фасол|чечевиц|бобов|зернобоб/.test(n)) return 'legumes';
  if (/подсолнеч/.test(n)) return 'sunflower';
  if (/(^|\s)(соя|сои)(\s|$)/.test(n)) return 'soy';
  if (/рапс/.test(n)) return 'rapeseed';
  if (/(^|\s)(лен|льн)|лен-долгун/.test(n)) return 'flax';
  if (/кукуруз/.test(n)) return 'corn_fodder';
  if (/однолет.*трав|трав.*однолет/.test(n)) return 'grass_annual';
  if (/трав|сенокос|сено/.test(n)) return 'grass_perennial';
  if (/корнеплод|кормов.*свекл|кормов.*морков/.test(n)) return 'fodder_root';
  if (/кормов|силос/.test(n)) return 'fodder_other';
  if (/овощ|капуст|морков|свекл|(^|\s)лук|огурц|помидор|томат|редис|реп[аы]|брюкв|чеснок|кабач|тыкв/.test(n)) return 'vegetables';
  if (/зерн/.test(n)) return 'grain_other';
  return 'other';
}

export const isWinterCrop = (name: string) => /озим/.test(norm(name));

export interface CropTotals {
  /** Посевная площадь, га. */
  sown_ha: number;
  /** Убранная площадь, га. */
  harvested_ha: number;
  /** Валовой сбор, ц. */
  gross_c: number;
}

export const emptyTotals = (): CropTotals => ({ sown_ha: 0, harvested_ha: 0, gross_c: 0 });

/**
 * Площади и сбор по категориям за период. Если посев не вносили, посевная площадь = убранной
 * (фермер учитывает только уборку), чтобы среднюю урожайность можно было посчитать.
 */
export function cropTotalsByCategory(crops: CropRow[], range: DateRange): Map<CropCategory, CropTotals> {
  const result = new Map<CropCategory, CropTotals>();
  const get = (c: CropCategory) => {
    let t = result.get(c);
    if (!t) {
      t = emptyTotals();
      result.set(c, t);
    }
    return t;
  };
  for (const row of crops) {
    if (!inRange(row.occurred_on, range)) continue;
    const t = get(classifyCrop(row.crop));
    if (row.operation === 'sowing') t.sown_ha += row.area_ha;
    else {
      t.harvested_ha += row.area_ha;
      t.gross_c += (row.yield_t ?? 0) * 10;
    }
  }
  for (const t of result.values()) if (t.sown_ha === 0) t.sown_ha = t.harvested_ha;
  return result;
}

export function sumTotals(map: Map<CropCategory, CropTotals>, cats: readonly CropCategory[]): CropTotals {
  const total = emptyTotals();
  for (const c of cats) {
    const t = map.get(c);
    if (!t) continue;
    total.sown_ha += t.sown_ha;
    total.harvested_ha += t.harvested_ha;
    total.gross_c += t.gross_c;
  }
  return total;
}
