// Демо-«Меркурий»: планировщик синхронизации. Из продаж с mercury_status draft/pending
// формируются учебные ветеринарные документы (УЧ-ВСД-NNN). Реальной интеграции с ФГИС ВетИС нет.
// Один и тот же код используется в приложении (офлайн-вариант) и в api/mercury/sync.ts.
import type { MercuryStatus } from '../data/contract';
import { kgToLiters } from './period';
import type { LivestockGroup, ProductKind } from './types';

export interface MercurySource {
  kind: 'product_sale' | 'livestock';
  id: string;
  occurred_on: string;
  /** Для продукции: вид и количество в кг/шт; для скота: группа и головы. */
  product?: ProductKind;
  group?: LivestockGroup;
  quantity: number;
  counterparty: string | null;
  destination: string | null;
  mercury_status: MercuryStatus;
}

export interface PlannedMercuryDoc {
  number: string;
  product: string;
  quantity: number;
  unit: string;
  status: 'issued';
  issued_on: string;
  produced_on: string;
  sender: string;
  recipient: string;
  source_kind: 'product_sale' | 'livestock';
  source_id: string;
}

const PRODUCT_NAME: Record<ProductKind, string> = {
  milk: 'Молоко сырое',
  eggs: 'Яйца куриные',
  wool: 'Шерсть',
  honey: 'Мёд натуральный',
};

const GROUP_NAME: Partial<Record<LivestockGroup, string>> = {
  cattle_cows: 'Крупный рогатый скот',
  cattle_calves: 'Крупный рогатый скот',
  cattle_other: 'Крупный рогатый скот',
  pigs_sows: 'Свиньи',
  pigs_other: 'Свиньи',
  sheep: 'Овцы',
  goats: 'Козы',
  horses_mares: 'Лошади',
  horses_young: 'Лошади',
  horses_stallions: 'Лошади',
  horses_other: 'Лошади',
  deer: 'Олени северные',
  poultry: 'Птица',
  rabbits: 'Кролики',
};

export const VSD_PREFIX = 'УЧ-ВСД-';

export function nextVsdNumber(existing: string[]): number {
  const max = existing.reduce((m, n) => {
    const match = /(\d+)$/.exec(n);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return max + 1;
}

export const isPendingMercury = (s: MercuryStatus) => s === 'draft' || s === 'pending';

export function planMercurySync(
  sources: MercurySource[],
  existingNumbers: string[],
  alreadyIssuedSourceIds: Set<string>,
  farmName: string,
  today: string,
): PlannedMercuryDoc[] {
  let next = nextVsdNumber(existingNumbers);
  const docs: PlannedMercuryDoc[] = [];
  const pending = sources
    .filter((s) => isPendingMercury(s.mercury_status) && !alreadyIssuedSourceIds.has(s.id))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  for (const s of pending) {
    const isProduct = s.kind === 'product_sale' && s.product;
    const name = isProduct ? PRODUCT_NAME[s.product!] : (GROUP_NAME[s.group!] ?? 'Сельскохозяйственные животные');
    let quantity = s.quantity;
    let unit = 'гол.';
    if (isProduct) {
      if (s.product === 'milk') {
        quantity = kgToLiters(s.quantity);
        unit = 'л';
      } else if (s.product === 'eggs') unit = 'шт';
      else unit = 'кг';
    }
    docs.push({
      number: `${VSD_PREFIX}${String(next++).padStart(3, '0')}`,
      product: name,
      quantity,
      unit,
      status: 'issued',
      issued_on: today,
      produced_on: s.occurred_on,
      sender: `${farmName} · учебный отправитель`,
      recipient: s.counterparty || s.destination || 'Учебный получатель',
      source_kind: s.kind,
      source_id: s.id,
    });
  }
  return docs;
}
