// Разбор русских фраз: нормализация, числа (цифры и слова), даты, единицы. Без зависимостей.
import { MONTHS_GEN } from '../../../app/src/reports/format';

// В JS \b не знает кириллицу: заменяем границу слова на lookaround по буквам и цифрам.
const WORD = 'а-яa-z0-9';
const CYR_BOUNDARY = `(?:(?<![${WORD}])(?=[${WORD}])|(?<=[${WORD}])(?![${WORD}]))`;
const cache = new Map<RegExp, RegExp>();
export function cy(re: RegExp): RegExp {
  let r = cache.get(re);
  if (!r) {
    r = new RegExp(re.source.replace(/\\b/g, CYR_BOUNDARY), re.flags);
    cache.set(re, r);
  }
  return r;
}
/** re.test(text) с кириллическими границами слов. */
export const test = (re: RegExp, text: string): boolean => cy(re).test(text);

export const norm = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[  ]/g, ' ')
    .replace(/[«»"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const UNITS: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
};
const TENS: Record<string, number> = {
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
};
const HUNDREDS: Record<string, number> = {
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
};
const THOUSANDS = new Set(['тысяча', 'тысячи', 'тысяч', 'тыс']);

const isNumWord = (w: string) => w in UNITS || w in TENS || w in HUNDREDS || THOUSANDS.has(w);

export type NumKind = 'liters' | 'kg' | 'tons' | 'pieces' | 'money' | 'heads' | 'day' | 'plain';

export interface FoundNumber {
  value: number;
  kind: NumKind;
  start: number;
  end: number;
}

const MONTH_STEMS = MONTHS_GEN.map((m) => m);

interface Token {
  text: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /\d+(?:[.,]\d+)?|[а-яa-z]+|[₽%]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

function kindAfter(next: string | undefined, prev: string | undefined): NumKind {
  if (!next) return 'plain';
  if (/^(л|литр[а-я]*)$/.test(next)) return 'liters';
  if (/^(кг|килограмм[а-я]*|кило)$/.test(next)) return 'kg';
  if (/^(т|тонн[а-я]*)$/.test(next)) return 'tons';
  if (/^(шт|штук[а-я]*)$/.test(next)) return 'pieces';
  if (/^(руб[а-я]*|₽|р)$/.test(next)) return 'money';
  if (/^голов[а-я]*$/.test(next)) return 'heads';
  if (MONTH_STEMS.includes(next)) return 'day';
  if (prev === 'за' && /^(тыс[а-я]*)$/.test(next)) return 'money';
  return 'plain';
}

/** Находит числа (цифрами и словами) и определяет, к чему они относятся по следующему слову. */
export function findNumbers(raw: string): FoundNumber[] {
  // «1 200» → «1200»
  const text = raw.replace(/(\d)\s(?=\d{3}(?!\d))/g, '$1');
  const tokens = tokenize(text);
  const found: FoundNumber[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^\d/.test(t.text)) {
      let value = Number(t.text.replace(',', '.'));
      let end = i;
      // «80 тысяч»
      if (tokens[i + 1] && THOUSANDS.has(tokens[i + 1]!.text)) {
        value *= 1000;
        end = i + 1;
      }
      const next = tokens[end + 1]?.text;
      const prev = tokens[i - 1]?.text;
      const kind = end > i && !next ? 'money' : kindAfter(next, prev);
      found.push({ value, kind: end > i && kind === 'plain' && prev === 'за' ? 'money' : kind, start: t.start, end: tokens[end]!.end });
      i = end;
      continue;
    }
    if (isNumWord(t.text)) {
      let total = 0;
      let current = 0;
      let j = i;
      let any = false;
      for (; j < tokens.length && isNumWord(tokens[j]!.text); j++) {
        const w = tokens[j]!.text;
        if (THOUSANDS.has(w)) {
          total += (current || 1) * 1000;
          current = 0;
        } else current += UNITS[w] ?? TENS[w] ?? HUNDREDS[w] ?? 0;
        any = true;
      }
      if (any) {
        const value = total + current;
        const next = tokens[j]?.text;
        const prev = tokens[i - 1]?.text;
        found.push({ value, kind: kindAfter(next, prev), start: t.start, end: tokens[j - 1]!.end });
        i = j - 1;
      }
    }
  }
  return found;
}

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(iso: string, delta: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Дата события из фразы: сегодня (по умолчанию), вчера, позавчера, «20 октября», «20.10», «20.10.2026». */
export function parseDate(textNorm: string, today: string): string {
  if (test(/\bпозавчера\b/, textNorm)) return addDays(today, -2);
  if (test(/\bвчера\b/, textNorm)) return addDays(today, -1);
  const year = Number(today.slice(0, 4));
  const named = new RegExp(`(\\d{1,2})\\s+(${MONTHS_GEN.join('|')})(?:\\s+(\\d{4}))?`).exec(textNorm);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS_GEN.indexOf(named[2]!) + 1;
    return validDate(Number(named[3] ?? year), month, day) ?? today;
  }
  const dotted = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/.exec(textNorm);
  if (dotted) return validDate(Number(dotted[3] ?? year), Number(dotted[2]), Number(dotted[1])) ?? today;
  return today;
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** «2026-10-23» → «23 октября». */
export const fmtDayMonth = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1] ?? ''}`;

/** «до конца октября» → номер месяца (10); иначе null. */
export function monthDeadline(textNorm: string): number | null {
  const m = new RegExp(`до конца (${MONTHS_GEN.join('|')})`).exec(textNorm);
  if (!m) return null;
  const idx = MONTHS_GEN.indexOf(m[1]!);
  return idx >= 0 ? idx + 1 : null;
}
