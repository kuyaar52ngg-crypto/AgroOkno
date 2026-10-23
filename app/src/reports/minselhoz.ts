// Общее ядро форм Минсельхоза России: 1-КФХ (приказ № 165, коды строк 23xxxx) и 1-ИП (коды 24xxxx).
// Бланки совпадают по структуре, отличаются префиксом кода («23» / «24») и адресами ячеек.
// Ключи результата — код строки без префикса: `1111.1` → «231111.1» в 1-КФХ и «241111.1» в 1-ИП.
import { cropTotalsByCategory, FODDER_CATEGORIES, GRAIN_CATEGORIES, sumTotals, type CropCategory } from './crops';
import {
  balanceOn,
  CATTLE,
  HORSES,
  inRange,
  PIGS,
  round1,
  round2,
  SHEEP_GOATS,
  toCentners,
  toThousands,
  type DateRange,
} from './period';
import type { FarmData, LivestockGroup, ProductKind } from './types';

export interface IncomeLine {
  /** Текущий год, тыс. руб. */
  cur: number;
  /** Предыдущий год, тыс. руб. */
  prev: number;
}

export interface CropLine {
  sown_ha: number;
  harvested_ha: number;
  produced_c: number;
  yield_c_ha: number;
  sold_c: number;
  income_k: number;
  price_rub: number;
}

export interface LivestockLine {
  produced_c: number;
  sold_c: number;
  income_k: number;
  price_rub: number;
}

export interface HeadsLine {
  start: number;
  end: number;
}

export interface MinselhozResult {
  year: number;
  /** Раздел «Доходы и расходы» (X-1): 1100, 1110, 1111, 1111.1, 1111.2. */
  income: Record<string, IncomeLine>;
  /** Растениеводство (X-5): 5100, 5110, 5112, 5113, 5114, 5115, 5116, 5130, 5132, 5133, 5151, 5153, 5154, 5155, 5160, 5162, 5163, 5164. */
  crops: Record<string, CropLine>;
  /** Животноводство (X-6): 6110…6119, 6120…6123, 6130…6131.1, 6140, 6150. */
  livestock: Record<string, LivestockLine>;
  /** Наличие животных на начало/конец года: 6210…6320. */
  heads: Record<string, HeadsLine>;
  /** Потери от падежа, голов (6200). */
  losses: number;
  /** Молочное направление КРС (иначе мясное) — определяет блок 621x/622x. */
  dairy: boolean;
}

const WEIGHT_GROUPS: Record<string, readonly LivestockGroup[]> = {
  '6111': CATTLE, // молочный КРС (если ферма молочная)
  '6112': CATTLE, // мясной КРС
  '6113': PIGS,
  '6114': SHEEP_GOATS,
  '6115': ['poultry'],
  '6116': ['deer'],
  '6118': HORSES,
  '6119': ['rabbits'],
};

const round = (n: number) => round1(n);
const CATEGORY_GROUPS: Record<string, readonly CropCategory[]> = {
  '5110': GRAIN_CATEGORIES,
  '5112': ['wheat_winter', 'wheat_spring'],
  '5113': ['buckwheat'],
  '5114': ['rye'],
  '5115': ['barley'],
  '5116': ['legumes'],
  '5130': ['sunflower', 'soy', 'rapeseed'],
  '5131': ['rapeseed'],
  '5132': ['sunflower'],
  '5133': ['soy'],
  '5151': ['vegetables'],
  '5153': ['potato'],
  '5154': ['sugar_beet'],
  '5155': ['melons'],
  '5164': FODDER_CATEGORIES,
};

function incomeFor(data: FarmData, range: DateRange): number {
  const livestock = data.movements
    .filter((m) => (m.kind === 'sale' || m.kind === 'sale_slaughter') && inRange(m.occurred_on, range))
    .reduce((s, m) => s + (m.amount_rub ?? 0), 0);
  const products = data.sales.filter((s) => inRange(s.occurred_on, range)).reduce((s, x) => s + (x.amount_rub ?? 0), 0);
  return livestock + products;
}

export function computeMinselhoz(data: FarmData, year: number): MinselhozResult {
  const range: DateRange = { from: `${year}-01-01`, to: `${year}-12-31` };
  const prevRange: DateRange = { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };

  // ─── Доходы ───────────────────────────────────────────────────────────────
  const income: Record<string, IncomeLine> = {};
  const incomeLine = (r: DateRange) => round(incomeFor(data, r) / 1000);
  const total: IncomeLine = { cur: incomeLine(range), prev: incomeLine(prevRange) };
  income['1100'] = total;
  income['1110'] = total;
  income['1111'] = total;
  income['1111.1'] = total; // продажи ведутся только по животноводству; продажа продукции растениеводства событием не вносится
  income['1111.2'] = { cur: 0, prev: 0 };
  income['1190'] = { cur: total.cur ? 100 : 0, prev: total.prev ? 100 : 0 }; // доля дохода от реализации собственной продукции, %

  // ─── Растениеводство ─────────────────────────────────────────────────────
  const byCat = cropTotalsByCategory(data.crops, range);
  const crops: Record<string, CropLine> = {};
  const emptyCrop = (): CropLine => ({ sown_ha: 0, harvested_ha: 0, produced_c: 0, yield_c_ha: 0, sold_c: 0, income_k: 0, price_rub: 0 });
  for (const [code, cats] of Object.entries(CATEGORY_GROUPS)) {
    const t = sumTotals(byCat, cats);
    if (!t.sown_ha && !t.harvested_ha && !t.gross_c) continue;
    crops[code] = {
      ...emptyCrop(),
      sown_ha: round2(t.sown_ha),
      harvested_ha: round2(t.harvested_ha),
      produced_c: round1(t.gross_c),
      yield_c_ha: t.harvested_ha > 0 ? round1(t.gross_c / t.harvested_ha) : 0,
    };
  }
  const feedC = (feed: 'hay' | 'haylage' | 'silage') =>
    data.feed
      .filter((f) => f.operation === 'harvest' && f.feed === feed && inRange(f.occurred_on, range))
      .reduce((s, f) => s + f.quantity_t * 10, 0);
  const hay = feedC('hay');
  const greenMass = feedC('haylage') + feedC('silage');
  if (hay) crops['5162'] = { ...emptyCrop(), produced_c: round1(hay) };
  if (greenMass) crops['5163'] = { ...emptyCrop(), produced_c: round1(greenMass) };
  const fodderCrops = crops['5164']?.produced_c ?? 0;
  const fodderTotal = hay + greenMass + fodderCrops;
  if (fodderTotal) crops['5160'] = { ...emptyCrop(), produced_c: round1(fodderTotal) };
  // 5100 — всего произведено (без последующей переработки): сумма верхнеуровневых групп.
  const topCodes = ['5110', '5130', '5151', '5153', '5154', '5155', '5160'];
  const topSum = topCodes.reduce((s, c) => s + (crops[c]?.produced_c ?? 0), 0);
  if (topSum) crops['5100'] = { ...emptyCrop(), produced_c: round1(topSum) };

  // ─── Животноводство ──────────────────────────────────────────────────────
  const dairy = data.outputs.some((o) => o.product === 'milk' && (!o.source_group || CATTLE.includes(o.source_group)));
  const livestock: Record<string, LivestockLine> = {};
  const yearMoves = data.movements.filter((m) => inRange(m.occurred_on, range));
  const weight = (kinds: string[], groups?: readonly LivestockGroup[]) =>
    yearMoves
      .filter((m) => kinds.includes(m.kind) && (!groups || groups.includes(m.animal_group)))
      .reduce((s, m) => s + (m.live_weight_kg ?? 0), 0);
  const amount = (kinds: string[], groups?: readonly LivestockGroup[]) =>
    yearMoves
      .filter((m) => kinds.includes(m.kind) && (!groups || groups.includes(m.animal_group)))
      .reduce((s, m) => s + (m.amount_rub ?? 0), 0);
  const killed = ['slaughter', 'sale_slaughter'];
  const soldKinds = ['sale', 'sale_slaughter'];

  const liveLine = (groups?: readonly LivestockGroup[]): LivestockLine => {
    const soldKg = weight(soldKinds, groups);
    const income_k = round(amount(soldKinds, groups) / 1000);
    return {
      produced_c: toCentners(weight(killed, groups)),
      sold_c: toCentners(soldKg),
      income_k,
      price_rub: soldKg > 0 ? Math.round(amount(soldKinds, groups) / (soldKg / 100)) : 0,
    };
  };
  const nonEmpty = (l: LivestockLine) => l.produced_c || l.sold_c || l.income_k;
  const whole = liveLine();
  if (nonEmpty(whole)) livestock['6110'] = whole;
  for (const [code, groups] of Object.entries(WEIGHT_GROUPS)) {
    if ((code === '6111' && !dairy) || (code === '6112' && dairy)) continue;
    const line = liveLine(groups);
    if (nonEmpty(line)) livestock[code] = line;
  }

  const outputKg = (product: ProductKind, groups?: readonly LivestockGroup[]) =>
    data.outputs
      .filter((o) => o.product === product && inRange(o.occurred_on, range) && (!groups || (o.source_group && groups.includes(o.source_group))))
      .reduce((s, o) => s + o.quantity, 0);
  const soldQty = (product: ProductKind) =>
    data.sales.filter((s) => s.product === product && inRange(s.occurred_on, range)).reduce((s, x) => s + x.quantity, 0);
  const soldAmount = (product: ProductKind) =>
    data.sales.filter((s) => s.product === product && inRange(s.occurred_on, range)).reduce((s, x) => s + (x.amount_rub ?? 0), 0);

  const productLine = (product: ProductKind, produced: number): LivestockLine => {
    const unit = product === 'eggs' ? toThousands : toCentners;
    const sold = soldQty(product);
    return {
      produced_c: unit(produced),
      sold_c: unit(sold),
      income_k: round(soldAmount(product) / 1000),
      price_rub: sold > 0 ? Math.round(soldAmount(product) / (product === 'eggs' ? sold / 1000 : sold / 100)) : 0,
    };
  };
  const milk = outputKg('milk');
  if (milk || soldQty('milk')) {
    const line = productLine('milk', milk);
    livestock['6120'] = line;
    if (milk) livestock['6121'] = productLine('milk', outputKg('milk', CATTLE) || milk);
  }
  const eggs = outputKg('eggs');
  if (eggs || soldQty('eggs')) {
    livestock['6130'] = productLine('eggs', eggs);
    livestock['6131'] = livestock['6130'];
    livestock['6131.1'] = livestock['6130'];
  }
  const wool = outputKg('wool');
  if (wool || soldQty('wool')) livestock['6140'] = productLine('wool', wool);
  const honey = outputKg('honey');
  if (honey || soldQty('honey')) livestock['6150'] = productLine('honey', honey);

  // ─── Поголовье ───────────────────────────────────────────────────────────
  const start = balanceOn(data.movements, `${year - 1}-12-31`);
  // Остатки «на начало учёта», внесённые в текущем году, входят в наличие на начало года.
  for (const m of yearMoves) {
    if (m.kind === 'opening_balance') start[m.animal_group] = (start[m.animal_group] ?? 0) + m.heads;
  }
  const end = balanceOn(data.movements, `${year}-12-31`);
  const heads: Record<string, HeadsLine> = {};
  const hl = (code: string, groups: readonly LivestockGroup[]) => {
    const line = {
      start: groups.reduce((s, g) => s + (start[g] ?? 0), 0),
      end: groups.reduce((s, g) => s + (end[g] ?? 0), 0),
    };
    if (line.start || line.end) heads[code] = line;
  };
  const block = dairy ? '621' : '622';
  hl(`${block}0`, CATTLE);
  hl(`${block}1`, ['cattle_cows']);
  hl(`${block}2`, ['cattle_other']);
  hl(`${block}4`, ['cattle_calves']);
  hl('6230', PIGS);
  hl('6240', ['sheep']);
  hl('6250', ['goats']);
  hl('6260', ['poultry']);
  hl('6270', ['deer']);
  hl('6290', HORSES);
  hl('6291', HORSES); // мясные табунные лошади
  hl('6320', ['rabbits']);

  const losses = yearMoves.filter((m) => m.kind === 'death').reduce((s, m) => s + m.heads, 0);

  return { year, income, crops, livestock, heads, losses, dairy };
}
