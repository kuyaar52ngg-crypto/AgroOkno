// Форма № 2-фермер (Росстат, приказ от 31.07.2024 № 339): «Сведения о сборе урожая сельскохозяйственных культур».
// Раздел 1 «Сельскохозяйственные культуры»: посевная площадь (гр. 4), площадь уборки (гр. 5),
// фактический сбор, ц (гр. 6), средний сбор с 1 га, ц (гр. 8 = гр. 6 / гр. 5). Коды строк — по бланку «Росстат 2-фермер.XLSX».
import {
  cropTotalsByCategory,
  FODDER_CATEGORIES,
  GRAIN_CATEGORIES,
  sumTotals,
  TECHNICAL_CATEGORIES,
  type CropCategory,
  type CropTotals,
} from './crops';
import { inRange, round1, round2 } from './period';
import type { FarmData } from './types';

export interface Fermer2Line {
  /** Уточнённая посевная площадь, га (гр. 4). */
  sown_ha: number;
  /** Общая площадь уборки, га (гр. 5). */
  harvested_ha: number;
  /** Фактический сбор со всей площади, ц (гр. 6). */
  gross_c: number;
  /** Средний сбор с 1 га, ц (гр. 8). */
  yield_c_ha: number;
}

export interface Fermer2Result {
  /** Ключ — код строки формы (1140, 1110, 1301…). */
  lines: Record<string, Fermer2Line>;
}

const LINE_CATEGORIES: Record<string, readonly CropCategory[]> = {
  '1140': GRAIN_CATEGORIES, // зерновые и зернобобовые — всего
  '1104': ['wheat_winter'],
  '1110': ['wheat_spring'],
  '1112': ['barley'],
  '1113': ['oats'],
  '1121': ['buckwheat'],
  '1238': TECHNICAL_CATEGORIES, // технические культуры — всего
  '1213': ['sugar_beet'],
  '1218': ['sunflower'],
  '1221': ['soy'],
  '1301': ['potato'],
  '1302': ['vegetables'],
  '1320': ['melons'],
  '1434': FODDER_CATEGORIES, // кормовые культуры — всего
  '1401': ['fodder_root'],
  '1406': ['corn_fodder'],
  '1411': ['grass_annual'],
  '1421': ['grass_perennial'],
};

function toLine(t: CropTotals): Fermer2Line {
  return {
    sown_ha: round2(t.sown_ha),
    harvested_ha: round2(t.harvested_ha),
    gross_c: round1(t.gross_c),
    yield_c_ha: t.harvested_ha > 0 ? round1(t.gross_c / t.harvested_ha) : 0,
  };
}

export function computeFermer2(data: FarmData, year: number): Fermer2Result {
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const byCat = cropTotalsByCategory(data.crops, range);
  const lines: Record<string, Fermer2Line> = {};

  for (const [code, cats] of Object.entries(LINE_CATEGORIES)) {
    const t = sumTotals(byCat, cats);
    if (t.sown_ha || t.harvested_ha || t.gross_c) lines[code] = toLine(t);
  }

  // 1440 — вся посевная площадь (сумма строк 1140, 1238, 1301, 1302, 1320, 1434).
  const total = emptyAreas(['1140', '1238', '1301', '1302', '1320', '1434'], lines);
  if (total > 0) lines['1440'] = { sown_ha: round2(total), harvested_ha: 0, gross_c: 0, yield_c_ha: 0 };

  // Естественные сенокосы: сбор по заготовке сена (т → ц), площади не ведутся.
  const hay = data.feed
    .filter((f) => f.operation === 'harvest' && f.feed === 'hay' && inRange(f.occurred_on, range))
    .reduce((s, f) => s + f.quantity_t * 10, 0);
  const green = data.feed
    .filter((f) => f.operation === 'harvest' && (f.feed === 'haylage' || f.feed === 'silage') && inRange(f.occurred_on, range))
    .reduce((s, f) => s + f.quantity_t * 10, 0);
  if (hay) lines['1501'] = { sown_ha: 0, harvested_ha: 0, gross_c: round1(hay), yield_c_ha: 0 };
  if (green) lines['1502'] = { sown_ha: 0, harvested_ha: 0, gross_c: round1(green), yield_c_ha: 0 };

  return { lines };
}

function emptyAreas(codes: string[], lines: Record<string, Fermer2Line>): number {
  return codes.reduce((s, c) => s + (lines[c]?.sown_ha ?? 0), 0);
}
