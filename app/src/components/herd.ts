import { plural } from '@/constants/format';
import { speciesOfGroup } from '@/constants/labels';
import type { SpeciesKey } from '@/constants/labels';
import type { HerdSummary, LivestockGroup } from '@/data/contract';

export interface HerdRow {
  key: string;
  label: string;
  hint: string;
  heads: number;
  species: SpeciesKey;
  /** Группа, с которой открывается событие «Рождение/Покупка» (+) и «Падеж/Забой/Продажа» (−). */
  group: LivestockGroup;
}

const HORSES: LivestockGroup[] = ['horses_mares', 'horses_young', 'horses_stallions', 'horses_other'];

/** Строки списка скота (D3): лошади всех групп объединены в одну строку, как в макете. */
export function herdRows(herd: HerdSummary | undefined): HerdRow[] {
  if (!herd) return [];
  const rows: HerdRow[] = [];
  let horsesAdded = false;
  for (const g of herd.groups) {
    if (HORSES.includes(g.group)) {
      if (horsesAdded) continue;
      horsesAdded = true;
      const get = (group: LivestockGroup) => herd.groups.find((x) => x.group === group)?.heads ?? 0;
      const mares = get('horses_mares');
      const young = get('horses_young');
      const stallions = get('horses_stallions');
      const total = HORSES.reduce((s, x) => s + get(x), 0);
      rows.push({
        key: 'horses',
        label: 'Лошади',
        hint: `${mares} ${plural(mares, ['кобыла', 'кобылы', 'кобыл'])} · ${young} молодых · ${stallions} ${plural(stallions, ['жеребец', 'жеребца', 'жеребцов'])}`,
        heads: total,
        species: 'horses',
        group: 'horses_mares',
      });
      continue;
    }
    rows.push({
      key: g.group,
      label: g.label,
      hint: g.hint,
      heads: g.heads,
      species: speciesOfGroup(g.group).key,
      group: g.group,
    });
  }
  return rows;
}
