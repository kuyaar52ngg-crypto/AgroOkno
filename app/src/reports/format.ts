// Форматирование чисел и дат для строк превью (русская локаль). Без зависимостей от UI-слоя.
const NBSP = ' ';

export function fmtNum(value: number, digits?: number): string {
  const fixed = digits === undefined ? String(value) : value.toFixed(digits);
  const negative = fixed.startsWith('-');
  const [intPart, frac] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '−' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const headsWord = (n: number) => plural(n, ['голова', 'головы', 'голов']);
export const horsesWord = (n: number) => plural(n, ['лошадь', 'лошади', 'лошадей']);

export const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
export const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export const monthName = (month: number) => MONTHS_NOM[month - 1] ?? '';
export const monthNameLower = (month: number) => (MONTHS_NOM[month - 1] ?? '').toLowerCase();

/** 2026-10-23 → «23.10.2026». */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** 2026-10-22 → «22.10». */
export function fmtDayMonthShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}` : iso;
}
