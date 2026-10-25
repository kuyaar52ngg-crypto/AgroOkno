// Демо-«Хорриот» (ФГИС ВетИС): планировщик передачи и сверка с похозяйственной книгой.
// Каждая запись журнала поголовья без записи в Хорриоте превращается в учебную запись УЧ-ХР-NNN:
// приход (начальный остаток, рождение, покупка, поступление) — регистрация, расход — выбытие.
// Реальной интеграции с ФГИС ВетИС нет. Один и тот же код — в приложении (офлайн), api/horriot/sync.ts и PDF-выписке.
import type { HorriotReconciliationRow } from '../data/contract';
import { ALL_GROUPS, balanceOn, movementSign } from './period';
import type { LivestockGroup, MovementKind, MovementRow } from './types';

export type HorriotKind = 'registration' | 'disposal';

/** Запись журнала поголовья — источник учебной записи Хорриота. */
export interface HorriotSource {
  id: string;
  occurred_on: string;
  animal_group: LivestockGroup;
  kind: MovementKind;
  heads: number;
}

export interface PlannedHorriotRecord {
  number: string;
  kind: HorriotKind;
  animal_group: LivestockGroup;
  group_label: string;
  heads: number;
  reason: string;
  registered_on: string;
  source_movement_id: string;
}

/** Учебная запись Хорриота в минимальном виде для сверки. */
export interface HorriotRecordRow {
  kind: HorriotKind;
  animal_group: LivestockGroup;
  heads: number;
  registered_on: string;
}

export const HORRIOT_PREFIX = 'УЧ-ХР-';

/** Подписи групп животных по-русски (как в «Поголовье» и в книге). */
export const HORRIOT_GROUP_LABELS: Record<LivestockGroup, string> = {
  cattle_cows: 'Коровы',
  cattle_calves: 'Телята',
  cattle_other: 'КРС прочие',
  pigs_sows: 'Свиноматки',
  pigs_other: 'Свиньи прочие',
  sheep: 'Овцы',
  goats: 'Козы',
  horses_mares: 'Кобылы',
  horses_young: 'Молодняк лошадей',
  horses_stallions: 'Жеребцы',
  horses_other: 'Лошади прочие',
  deer: 'Олени',
  poultry: 'Птица',
  rabbits: 'Кролики',
};

/** Причина записи в Хорриоте по виду операции журнала. */
export const HORRIOT_REASONS: Record<MovementKind, string> = {
  opening_balance: 'Начальный остаток',
  birth: 'Рождение',
  purchase: 'Покупка',
  transfer_in: 'Поступление из другого хозяйства',
  sale: 'Продажа',
  sale_slaughter: 'Продажа на убой',
  slaughter: 'Забой',
  death: 'Падёж',
  transfer_out: 'Передача в другое хозяйство',
};

/** Порядок групп в таблице сверки (как на экране «Скот»). */
const GROUP_ORDER: readonly LivestockGroup[] = [
  'cattle_cows', 'cattle_calves', 'cattle_other', 'horses_mares', 'horses_young', 'horses_stallions', 'horses_other',
  'sheep', 'goats', 'pigs_sows', 'pigs_other', 'deer', 'poultry', 'rabbits',
];

export const groupLabel = (group: LivestockGroup): string => HORRIOT_GROUP_LABELS[group] ?? group;

export const horriotKindOf = (kind: MovementKind): HorriotKind => (movementSign(kind) > 0 ? 'registration' : 'disposal');

export const horriotKindLabel = (kind: HorriotKind): string => (kind === 'registration' ? 'Регистрация' : 'Выбытие');

export function nextHorriotNumber(existing: string[]): number {
  const max = existing.reduce((m, n) => {
    const match = /(\d+)$/.exec(n);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return max + 1;
}

/** Записи журнала, которые ещё не переданы в Хорриот. */
export const pendingHorriotSources = (sources: HorriotSource[], alreadyRegisteredSourceIds: Set<string>): HorriotSource[] =>
  sources.filter((s) => s.heads > 0 && !alreadyRegisteredSourceIds.has(s.id));

/**
 * Что создать при «Передать данные»: по одной записи на каждую запись журнала без записи в Хорриоте (идемпотентно по id).
 * Порядок: по дате, внутри даты — регистрации раньше выбытий, затем по id; номера продолжают существующие.
 */
export function planHorriotSync(
  sources: HorriotSource[],
  existingNumbers: string[],
  alreadyRegisteredSourceIds: Set<string>,
): PlannedHorriotRecord[] {
  let next = nextHorriotNumber(existingNumbers);
  const rank = (k: MovementKind) => (horriotKindOf(k) === 'registration' ? 0 : 1);
  return pendingHorriotSources(sources, alreadyRegisteredSourceIds)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || rank(a.kind) - rank(b.kind) || a.id.localeCompare(b.id))
    .map((s) => ({
      number: `${HORRIOT_PREFIX}${String(next++).padStart(3, '0')}`,
      kind: horriotKindOf(s.kind),
      animal_group: s.animal_group,
      group_label: groupLabel(s.animal_group),
      heads: s.heads,
      reason: HORRIOT_REASONS[s.kind],
      registered_on: s.occurred_on,
      source_movement_id: s.id,
    }));
}

/** Поголовье по версии Хорриота на дату: Σ регистраций − Σ выбытий (не меньше нуля по каждой группе). */
export function horriotBalanceOn(records: HorriotRecordRow[], on: string): Partial<Record<LivestockGroup, number>> {
  const result: Partial<Record<LivestockGroup, number>> = {};
  for (const r of records) {
    if (r.registered_on > on) continue;
    result[r.animal_group] = (result[r.animal_group] ?? 0) + (r.kind === 'registration' ? 1 : -1) * r.heads;
  }
  for (const key of Object.keys(result) as LivestockGroup[]) result[key] = Math.max(0, result[key] ?? 0);
  return result;
}

/**
 * Сверка «книга ЛПХ ↔ Хорриот» по группам на дату: book_heads — поголовье по журналу, horriot_heads — по учебным записям
 * Хорриота, diff = book − horriot (положительное — в Хорриот ещё не передано, отрицательное — в Хорриоте больше, чем в книге).
 * В таблицу попадают группы, где хотя бы одно из значений не нулевое.
 */
export function reconcileHorriot(movements: MovementRow[], records: HorriotRecordRow[], today: string): HorriotReconciliationRow[] {
  const book = balanceOn(movements, today);
  const horriot = horriotBalanceOn(records, today);
  const order = [...GROUP_ORDER, ...ALL_GROUPS.filter((g) => !GROUP_ORDER.includes(g))];
  const rows: HorriotReconciliationRow[] = [];
  for (const group of order) {
    const book_heads = book[group] ?? 0;
    const horriot_heads = horriot[group] ?? 0;
    if (book_heads === 0 && horriot_heads === 0) continue;
    rows.push({ animal_group: group, label: groupLabel(group), book_heads, horriot_heads, diff: book_heads - horriot_heads });
  }
  return rows;
}

/** Все группы совпадают с книгой. */
export const isReconciled = (rows: HorriotReconciliationRow[]): boolean => rows.every((r) => r.diff === 0);

/** Расхождение по-русски для PDF и подсказок: «Не передано в Хорриот: 3», «В Хорриоте больше на 2», «Совпадает». */
export function diffNote(row: HorriotReconciliationRow): string {
  if (row.diff === 0) return 'Совпадает';
  return row.diff > 0 ? `Не передано в Хорриот: ${row.diff}` : `В Хорриоте больше на ${-row.diff}`;
}
