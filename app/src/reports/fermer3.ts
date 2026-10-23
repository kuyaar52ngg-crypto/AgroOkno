// Форма № 3-фермер (Росстат, приказ от 30.01.2025 № 35):
// «Сведения о производстве продукции животноводства и поголовье скота».
// Модуль без зависимостей от React Native: используется и в приложении
// (предпросмотр офлайн), и в серверной функции, которая заполняет XLSX-бланк.

import { balanceOn, CATTLE, HORSES, inRange, PIGS, periodRange, SHEEP_GOATS, toCentners, toThousands } from './period';
import type { FarmData, LivestockGroup, MovementKind, ProductKind } from './types';
import type { ReportPeriod } from '../data/contract';

export type { LivestockGroup, MovementKind, ProductKind };

export interface Movement {
  animal_group: LivestockGroup;
  kind: MovementKind;
  heads: number;
  live_weight_kg: number | null;
}

export interface ProductOutput {
  product: ProductKind;
  quantity: number; // кг, для яиц — шт
  source_group: LivestockGroup | null;
}

export interface ProductSale {
  product: ProductKind;
  quantity: number;
}

export interface Fermer3Input {
  /** События за отчётный период. */
  movements: Movement[];
  outputs: ProductOutput[];
  sales: ProductSale[];
  /** Поголовье на конец периода по группам. */
  balance: Partial<Record<LivestockGroup, number>>;
}

/** Колонки раздела 3 (движение поголовья). */
export type Section3Column = 'cattle' | 'pigs' | 'sheep_goats' | 'poultry' | 'horses';

export interface Fermer3Result {
  /** Раздел 1: произведено. Ключ — № строки формы. */
  produced: Record<string, number>;
  /** Раздел 2: поголовье на конец периода. */
  herd: Record<string, number>;
  /** Раздел 3: движение поголовья, голов. */
  movement: Record<string, Partial<Record<Section3Column, number>>>;
  /** Раздел 4: реализовано. */
  sold: Record<string, number>;
}

const SECTION3_COLUMN: Partial<Record<LivestockGroup, Section3Column>> = {
  cattle_cows: 'cattle',
  cattle_calves: 'cattle',
  cattle_other: 'cattle',
  pigs_sows: 'pigs',
  pigs_other: 'pigs',
  sheep: 'sheep_goats',
  goats: 'sheep_goats',
  poultry: 'poultry',
  horses_mares: 'horses',
  horses_young: 'horses',
  horses_stallions: 'horses',
  horses_other: 'horses',
};


const SECTION3_ROWS: Record<string, MovementKind[]> = {
  '44': ['birth'],
  '46': ['death'],
  '47': ['slaughter', 'sale_slaughter'],
  '48': ['purchase'],
  '49': ['sale'],
};


export function computeFermer3(input: Fermer3Input): Fermer3Result {
  const { movements, outputs, sales, balance } = input;

  const weightKg = (kinds: MovementKind[], groups?: readonly LivestockGroup[]) =>
    movements
      .filter((m) => kinds.includes(m.kind) && (!groups || groups.includes(m.animal_group)))
      .reduce((sum, m) => sum + (m.live_weight_kg ?? 0), 0);

  const outputQty = (product: ProductKind, groups?: readonly LivestockGroup[]) =>
    outputs
      .filter((o) => o.product === product && (!groups || (o.source_group && groups.includes(o.source_group))))
      .reduce((sum, o) => sum + o.quantity, 0);

  const soldQty = (product: ProductKind) =>
    sales.filter((s) => s.product === product).reduce((sum, s) => sum + s.quantity, 0);

  const heads = (groups: readonly LivestockGroup[]) => groups.reduce((sum, g) => sum + (balance[g] ?? 0), 0);

  // Раздел 1. «Скот и птица на убой» = забито у себя + продано на убой.
  const killed: MovementKind[] = ['slaughter', 'sale_slaughter'];
  const produced: Record<string, number> = {
    '01': toCentners(weightKg(killed)),
    '02': toCentners(weightKg(killed, CATTLE)),
    '03': toCentners(weightKg(killed, PIGS)),
    '04': toCentners(weightKg(killed, SHEEP_GOATS)),
    '05': toCentners(weightKg(killed, ['poultry'])),
    '06': toCentners(weightKg(killed, ['deer'])),
    '07': toCentners(weightKg(killed, HORSES)),
    '07.2': toCentners(weightKg(killed, ['rabbits'])),
    '08': toCentners(outputQty('milk')),
    '09': toCentners(outputQty('milk', CATTLE)),
    '10': toCentners(outputQty('milk', ['cattle_cows'])),
    '12': toThousands(outputQty('eggs')),
    '14': toCentners(outputQty('wool')),
    '16': Math.round(outputQty('honey')), // в кг
  };

  // Раздел 2.
  const herd: Record<string, number> = {
    '21': heads(CATTLE),
    '22': heads(['cattle_cows']),
    '25': heads(PIGS),
    '26': heads(['sheep']),
    '28': heads(['goats']),
    '30': heads(HORSES),
    '31': heads(['poultry']),
    '34': heads(['deer']),
    '36': heads(['rabbits']),
  };

  // Раздел 3.
  const movement: Fermer3Result['movement'] = {};
  for (const [row, kinds] of Object.entries(SECTION3_ROWS)) {
    const cols: Partial<Record<Section3Column, number>> = {};
    for (const m of movements) {
      const col = SECTION3_COLUMN[m.animal_group];
      if (col && kinds.includes(m.kind)) cols[col] = (cols[col] ?? 0) + m.heads;
    }
    movement[row] = cols;
  }

  // Раздел 4. Скот — вся продажа живым весом (и на убой, и прочая).
  const soldLive: MovementKind[] = ['sale', 'sale_slaughter'];
  const sold: Record<string, number> = {
    '50': toCentners(weightKg(soldLive)),
    '51': toCentners(weightKg(soldLive, CATTLE)),
    '52': toCentners(weightKg(soldLive, PIGS)),
    '53': toCentners(weightKg(soldLive, SHEEP_GOATS)),
    '54': toCentners(weightKg(soldLive, ['poultry'])),
    '55': toCentners(weightKg(soldLive, ['deer'])),
    '56': toCentners(soldQty('milk')),
    '57': toThousands(soldQty('eggs')),
    '58': toCentners(soldQty('wool')),
    '59': toCentners(soldQty('honey')),
  };

  return { produced, herd, movement, sold };
}

/** Собирает вход маппера из данных хозяйства за период (месяц или год). */
export function buildFermer3Input(data: FarmData, period: ReportPeriod): Fermer3Input {
  const range = periodRange(period);
  return {
    movements: data.movements.filter((m) => m.kind !== 'opening_balance' && inRange(m.occurred_on, range)),
    outputs: data.outputs.filter((o) => inRange(o.occurred_on, range)),
    sales: data.sales.filter((s) => inRange(s.occurred_on, range)),
    balance: balanceOn(data.movements, range.to),
  };
}
