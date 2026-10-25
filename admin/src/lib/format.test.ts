import { describe, expect, it } from 'vitest';

import { fmtContext, fmtCount, fmtDate, fmtDateTime, fmtDayMonth, fmtNum, fmtPeriod, isoDayYakutsk, orDash, plural, rangeForDays } from './format';

describe('даты в Asia/Yakutsk (UTC+9)', () => {
  it('fmtDateTime переводит UTC в якутское время', () => {
    expect(fmtDateTime('2026-10-25T20:30:00Z')).toBe('26.10.2026, 05:30');
    expect(fmtDateTime('2026-10-25T10:05:00Z')).toBe('25.10.2026, 19:05');
  });

  it('fmtDate: полный ISO сдвигается поясом, дата без времени — нет', () => {
    expect(fmtDate('2026-10-25T20:30:00Z')).toBe('26.10.2026');
    expect(fmtDate('2026-10-25')).toBe('25.10.2026');
  });

  it('пустые и неверные значения → тире', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('')).toBe('—');
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('не дата')).toBe('—');
  });

  it('fmtDayMonth для подписи оси', () => {
    expect(fmtDayMonth('2026-10-05')).toBe('05.10');
    expect(fmtDayMonth('что-то')).toBe('что-то');
  });

  it('isoDayYakutsk: календарный день по Якутску', () => {
    expect(isoDayYakutsk(new Date('2026-10-25T20:30:00Z'))).toBe('2026-10-26');
    expect(isoDayYakutsk(new Date('2026-10-25T10:00:00Z'))).toBe('2026-10-25');
  });

  it('rangeForDays: последние N дней включая сегодня', () => {
    const now = new Date('2026-10-25T10:00:00Z');
    expect(rangeForDays(7, now)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(rangeForDays(30, now)).toEqual({ from: '2026-09-26', to: '2026-10-25' });
    expect(rangeForDays(1, now)).toEqual({ from: '2026-10-25', to: '2026-10-25' });
  });

  it('rangeForDays переходит через границу года', () => {
    expect(rangeForDays(10, new Date('2027-01-04T02:00:00Z'))).toEqual({ from: '2026-12-26', to: '2027-01-04' });
  });

  it('rangeForDays: поздний вечер по UTC уже следующий день в Якутске', () => {
    expect(rangeForDays(2, new Date('2026-10-25T20:30:00Z'))).toEqual({ from: '2026-10-25', to: '2026-10-26' });
  });
});

describe('отчётный период', () => {
  it('месячный и годовой', () => {
    expect(fmtPeriod(2026, 10)).toBe('Октябрь 2026');
    expect(fmtPeriod(2025, null)).toBe('2025 год');
    expect(fmtPeriod(2025, undefined)).toBe('2025 год');
  });
});

describe('числа и склонения', () => {
  it('plural', () => {
    const f: [string, string, string] = ['хозяйство', 'хозяйства', 'хозяйств'];
    expect(plural(1, f)).toBe('хозяйство');
    expect(plural(2, f)).toBe('хозяйства');
    expect(plural(5, f)).toBe('хозяйств');
    expect(plural(11, f)).toBe('хозяйств');
    expect(plural(21, f)).toBe('хозяйство');
    expect(plural(112, f)).toBe('хозяйств');
    expect(plural(0, f)).toBe('хозяйств');
  });

  it('fmtNum группирует разряды и терпит пустое', () => {
    expect(fmtNum(1200).replace(/\s/g, ' ')).toBe('1 200');
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Number.NaN)).toBe('—');
  });

  it('fmtCount', () => {
    expect(fmtCount(3, ['модель', 'модели', 'моделей']).replace(/\s/g, ' ')).toBe('3 модели');
  });

  it('fmtContext', () => {
    expect(fmtContext(200000)).toBe('200 тыс. токенов');
    expect(fmtContext(1048576)).toBe('1 млн токенов');
    expect(fmtContext(2000000)).toBe('2 млн токенов');
    expect(fmtContext(null)).toBe('');
  });

  it('orDash', () => {
    expect(orDash('  ')).toBe('—');
    expect(orDash(null)).toBe('—');
    expect(orDash('с. Намцы')).toBe('с. Намцы');
  });
});
