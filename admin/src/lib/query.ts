// Состояние страниц в адресной строке: поиск, фильтры, страница, сортировка (query-параметры).

export type ParamValue = string | number | null | undefined;
export type ParamPatch = Record<string, ParamValue>;

export const PAGE_SIZE = 20;

/** Применяет изменения к параметрам; пустые значения (null, undefined, '') удаляют ключ. Порядок ключей сохраняется. */
export function patchParams(current: URLSearchParams | string, patch: ParamPatch): URLSearchParams {
  const next = new URLSearchParams(typeof current === 'string' ? current : current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

/** Строка запроса вида «?a=1&b=2» (пустая, если параметров нет). Пустые значения пропускаются. */
export function buildSearch(params: ParamPatch): string {
  const sp = patchParams('', params);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Целое число из параметра в пределах [min, max]; иначе — запасное значение. */
export function readInt(value: string | null, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  if (value === null || value.trim() === '' || !/^-?\d+$/.test(value.trim())) return fallback;
  const n = Number(value);
  return n >= min && n <= max ? n : fallback;
}

/** Значение из разрешённого списка; иначе — запасное. */
export function readEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

/** Номер страницы (с 1) из параметра `page`. */
export function readPage(value: string | null): number {
  return readInt(value, 1, 1, 100000);
}

export function offsetOf(page: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(0, (page - 1) * pageSize);
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

/** `sort=created_at&dir=desc` → состояние сортировки или null. */
export function readSort(params: URLSearchParams, allowedKeys: readonly string[]): SortState | null {
  const key = params.get('sort');
  if (!key || !allowedKeys.includes(key)) return null;
  return { key, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };
}

/** Клик по заголовку: нет сортировки → по возрастанию → по убыванию → сброс. */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

type Comparable = string | number | boolean | null | undefined;

/** Устойчивая сортировка строк страницы; пустые значения — в конец независимо от направления. */
export function sortRows<T>(rows: readonly T[], sort: SortState | null, value: (row: T, key: string) => Comparable): T[] {
  if (!sort) return [...rows];
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = value(a.row, sort.key);
      const bv = value(b.row, sort.key);
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), 'ru', { numeric: true, sensitivity: 'base' });
      return cmp === 0 ? a.index - b.index : cmp * sign;
    })
    .map((x) => x.row);
}
