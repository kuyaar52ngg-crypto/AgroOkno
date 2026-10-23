// Форматирование чисел, дат и склонений для русскоязычного интерфейса.
// Часовой пояс хозяйства — Якутск (UTC+9): время в интерфейсе не зависит от пояса устройства.

const NBSP = ' ';
const YAKUTSK_OFFSET_MS = 9 * 60 * 60 * 1000;

const MONTHS_NOM = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const MONTHS_PREP = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

export function monthName(month: number): string {
  return MONTHS_NOM[month - 1] ?? '';
}

export function monthNameGenitive(month: number): string {
  return MONTHS_GEN[month - 1] ?? '';
}

export function monthNameLower(month: number): string {
  return MONTHS_PREP[month - 1] ?? '';
}

/** Выбор формы слова: plural(2, ['голова', 'головы', 'голов']) → «головы». */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** 1200 → «1 200», 18 → «18,0» (при digits = 1). */
export function fmtNum(value: number, digits?: number): string {
  const fixed = digits === undefined ? String(value) : value.toFixed(digits);
  const negative = fixed.startsWith('-');
  const [intPart, frac] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '−' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

export const HEADS_FORMS: [string, string, string] = ['голова', 'головы', 'голов'];

/** «15 голов», «1 голова», «32 головы». */
export function fmtHeads(n: number): string {
  return `${fmtNum(n)}${NBSP}${plural(n, HEADS_FORMS)}`;
}

/** Только слово: «голов». */
export function headsWord(n: number): string {
  return plural(n, HEADS_FORMS);
}

function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** 2026-10-23 → «23.10.2026». */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = parts(iso);
  if (!p) return iso;
  return `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`;
}

/** 2026-10-23 → «23 октября 2026». */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = parts(iso);
  if (!p) return iso;
  return `${p.d} ${monthNameGenitive(p.m)} ${p.y}`;
}

/** 2026-10-30 → «30 октября». */
export function fmtDayMonth(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${p.d} ${monthNameGenitive(p.m)}`;
}

function toYakutsk(iso: string): Date | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + YAKUTSK_OFFSET_MS);
}

/** ISO-время → «09:35» (время Якутска). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = toYakutsk(iso);
  if (!d) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** ISO-время → «23.10.2026» (дата по Якутску). */
export function fmtDateOfTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = toYakutsk(iso);
  if (!d) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

/** → «23.10.2026, 09:35». */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${fmtDateOfTime(iso)}, ${fmtTime(iso)}`;
}

/** → «23.10.2026 · 09:35». */
export function fmtDateTimeDot(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${fmtDateOfTime(iso)} · ${fmtTime(iso)}`;
}

/** Сегодняшняя дата по Якутску в формате YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date(Date.now() + YAKUTSK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Целое число дней между двумя датами YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return 0;
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86_400_000);
}

export function daysWord(n: number): string {
  return plural(n, ['день', 'дня', 'дней']);
}

/** Оставляет только цифры. */
export function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '');
}

/** Разбор числа из поля ввода: «2,5» → 2.5; пустая строка / мусор → null. */
export function parseNumber(value: string): number | null {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export const MILK_KG_PER_LITER = 1.03;

export function litersToKg(liters: number): number {
  return Math.round(liters * MILK_KG_PER_LITER * 100) / 100;
}

export function kgToLiters(kg: number): number {
  return Math.round(kg / MILK_KG_PER_LITER);
}

export function isValidInn(value: string): boolean {
  return /^\d{10}$|^\d{12}$/.test(value);
}

export function periodLabel(period: { year: number; month?: number }): string {
  return period.month ? `${monthName(period.month)} ${period.year}` : `${period.year} год`;
}

export const NBSP_CHAR = NBSP;
