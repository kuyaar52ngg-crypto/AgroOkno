// Форматирование дат, чисел и склонений. Часовой пояс — Asia/Yakutsk, локаль — ru-RU
// (время в панели не зависит от пояса компьютера администратора).

export const TIME_ZONE = 'Asia/Yakutsk';
const NBSP = ' ';

const dateFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const isoPartsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const numFmt = new Intl.NumberFormat('ru-RU');

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function monthName(month: number): string {
  return MONTHS_NOM[month - 1] ?? '';
}

export function monthNameGenitive(month: number): string {
  return MONTHS_GEN[month - 1] ?? '';
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «23.10.2026». Дата без времени (YYYY-MM-DD) не сдвигается часовым поясом. Пусто → «—». */
export function fmtDate(value: string | Date | null | undefined): string {
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  }
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

/** «23.10.2026, 14:05» в часовом поясе Якутска. Пусто → «—». */
export function fmtDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '—';
}

/** «23.10» — подпись оси графика (вход — YYYY-MM-DD). */
export function fmtDayMonth(isoDay: string): string {
  const m = DATE_ONLY.exec(isoDay);
  return m ? `${m[3]}.${m[2]}` : isoDay;
}

/** 1200 → «1 200». */
export function fmtNum(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? numFmt.format(n) : '—';
}

/** plural(2, ['хозяйство', 'хозяйства', 'хозяйств']) → «хозяйства». */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «5 хозяйств». */
export function fmtCount(n: number, forms: [string, string, string]): string {
  return `${fmtNum(n)}${NBSP}${plural(n, forms)}`;
}

/** Календарный день (YYYY-MM-DD) в часовом поясе Якутска. */
export function isoDayYakutsk(date: Date): string {
  return isoPartsFmt.format(date);
}

/** Период статистики «последние N дней включая сегодня»: { from, to } в формате YYYY-MM-DD (по Якутску). */
export function rangeForDays(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = isoDayYakutsk(now);
  const [y, m, d] = to.split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1, d - (days - 1)));
  return { from: start.toISOString().slice(0, 10), to };
}

/** Отчётный период: «Октябрь 2026» (месячный) или «2025 год» (годовой). */
export function fmtPeriod(year: number, month: number | null | undefined): string {
  return month ? `${monthName(month)} ${year}` : `${year} год`;
}

/** 200000 → «200 тыс. токенов», 1048576 → «1 млн токенов». Пусто → ''. */
export function fmtContext(tokens: number | null | undefined): string {
  if (!tokens) return '';
  if (tokens >= 1_000_000) return `${String(Math.round(tokens / 100_000) / 10).replace('.', ',')} млн токенов`;
  return `${Math.round(tokens / 1000)} тыс. токенов`;
}

/** Строка из значения или тире. */
export function orDash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}
