import type { LucideIcon } from 'lucide-react-native';
import CircleMinus from 'lucide-react-native/icons/circle-minus';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import Milk from 'lucide-react-native/icons/milk';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import Sprout from 'lucide-react-native/icons/sprout';
import Wheat from 'lucide-react-native/icons/wheat';

import { fmtDate, fmtHeads, fmtNum, kgToLiters } from '@/constants/format';
import {
  CROP_OPERATION_LABEL,
  cropGenitive,
  FEED_GENITIVE,
  FEED_OPERATION_LABEL,
  MOVEMENT_LABEL,
  PRODUCT_GENITIVE,
  PRODUCT_LABEL,
  groupLabel,
  speciesOfGroup,
} from '@/constants/labels';
import type { HerdSummary, JournalEntry, LivestockEvent } from '@/data/contract';

export interface EntryView {
  icon: LucideIcon;
  title: string;
  meta: string;
  value?: string;
}

const MILK_UNIT = 'л';

export function productQuantityText(product: 'milk' | 'eggs' | 'wool' | 'honey', quantity: number): string {
  if (product === 'milk') return `${fmtNum(kgToLiters(quantity))} ${MILK_UNIT}`;
  if (product === 'eggs') return `${fmtNum(quantity)} шт`;
  return `${fmtNum(quantity)} кг`;
}

export function headsInGroup(herd: HerdSummary | undefined, group: string | null | undefined): number | null {
  if (!herd || !group) return null;
  const found = herd.groups.find((g) => g.group === group);
  return found ? found.heads : null;
}

const OUTGOING = new Set<LivestockEvent['kind']>(['sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out']);

/** Заголовок, пояснение и значение строки журнала (B1) для любого события. */
export function describeEntry(entry: JournalEntry, herd?: HerdSummary): EntryView {
  const date = fmtDate(entry.occurred_on);
  switch (entry.type) {
    case 'livestock':
      return {
        icon: OUTGOING.has(entry.kind) ? CircleMinus : CirclePlus,
        title: `${MOVEMENT_LABEL[entry.kind]} · ${fmtHeads(entry.heads)}`,
        meta: `${date} · ${speciesOfGroup(entry.animal_group).label}`,
      };
    case 'product_output': {
      const heads = headsInGroup(herd, entry.source_group);
      const source = entry.source_group ? `${groupLabel(entry.source_group)}${heads !== null ? `, ${fmtHeads(heads)}` : ''}` : '';
      return {
        icon: Milk,
        title: entry.product === 'milk' ? 'Надой' : PRODUCT_LABEL[entry.product],
        meta: source ? `${date} · ${source}` : date,
        value: productQuantityText(entry.product, entry.quantity),
      };
    }
    case 'product_sale':
      return {
        icon: ShoppingCart,
        title: `Продажа ${PRODUCT_GENITIVE[entry.product]}`,
        meta: entry.buyer ? `${date} · ${entry.buyer}` : date,
        value: productQuantityText(entry.product, entry.quantity),
      };
    case 'feed':
      return {
        icon: Wheat,
        title: `${FEED_OPERATION_LABEL[entry.operation]} ${FEED_GENITIVE[entry.feed]}`,
        meta: entry.storage_place ? `${date} · ${entry.storage_place.split(' ')[0]}` : date,
        value: `${fmtNum(entry.quantity_t, 1)} т`,
      };
    case 'crop':
      return {
        icon: Sprout,
        title:
          entry.operation === 'harvest'
            ? `Сбор ${cropGenitive(entry.crop)}`
            : `${CROP_OPERATION_LABEL[entry.operation]}: ${entry.crop.toLowerCase()}`,
        meta: `${date} · ${fmtNum(entry.area_ha, 2)} га участка`,
        value: entry.operation === 'harvest' && entry.yield_t !== null ? `${fmtNum(entry.yield_t, 1)} т` : `${fmtNum(entry.area_ha, 2)} га`,
      };
  }
}
