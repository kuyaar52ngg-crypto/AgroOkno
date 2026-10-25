import { describe, expect, it } from 'vitest';

import { buildSearch, nextSort, offsetOf, pageCount, patchParams, readEnum, readInt, readPage, readSort, sortRows } from './query';

describe('построение query', () => {
  it('buildSearch пропускает пустые значения', () => {
    expect(buildSearch({ q: 'иванов', page: 2, status: null, year: undefined, form: '' })).toBe('?q=%D0%B8%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2&page=2');
    expect(buildSearch({})).toBe('');
    expect(buildSearch({ a: null })).toBe('');
  });

  it('patchParams добавляет, меняет и удаляет ключи, не трогая остальные', () => {
    const current = new URLSearchParams('q=abc&page=3&status=kfh');
    const next = patchParams(current, { page: null, status: 'ip', sort: 'name' });
    expect(next.toString()).toBe('q=abc&status=ip&sort=name');
    expect(current.toString()).toBe('q=abc&page=3&status=kfh');
  });

  it('patchParams принимает строку', () => {
    expect(patchParams('a=1', { b: 2 }).toString()).toBe('a=1&b=2');
  });
});

describe('чтение параметров', () => {
  it('readInt: число в пределах, иначе запасное', () => {
    expect(readInt('5', 1, 1, 10)).toBe(5);
    expect(readInt('0', 1, 1, 10)).toBe(1);
    expect(readInt('11', 1, 1, 10)).toBe(1);
    expect(readInt('abc', 7)).toBe(7);
    expect(readInt(null, 7)).toBe(7);
    expect(readInt('3.5', 7)).toBe(7);
    expect(readInt('-2', 0, -5, 5)).toBe(-2);
  });

  it('readEnum только из разрешённых', () => {
    expect(readEnum('30', ['7', '30', '90'] as const, '30')).toBe('30');
    expect(readEnum('15', ['7', '30', '90'] as const, '30')).toBe('30');
    expect(readEnum(null, ['7', '30'] as const, '7')).toBe('7');
  });

  it('readPage: от 1', () => {
    expect(readPage('4')).toBe(4);
    expect(readPage('0')).toBe(1);
    expect(readPage('-3')).toBe(1);
    expect(readPage(null)).toBe(1);
  });

  it('readSort', () => {
    expect(readSort(new URLSearchParams('sort=name&dir=desc'), ['name', 'date'])).toEqual({ key: 'name', dir: 'desc' });
    expect(readSort(new URLSearchParams('sort=name'), ['name'])).toEqual({ key: 'name', dir: 'asc' });
    expect(readSort(new URLSearchParams('sort=hack'), ['name'])).toBeNull();
    expect(readSort(new URLSearchParams(''), ['name'])).toBeNull();
  });
});

describe('страницы', () => {
  it('offsetOf и pageCount', () => {
    expect(offsetOf(1, 20)).toBe(0);
    expect(offsetOf(3, 20)).toBe(40);
    expect(offsetOf(0, 20)).toBe(0);
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(100, 25)).toBe(4);
  });
});

describe('сортировка в пределах страницы', () => {
  it('nextSort: по возрастанию → по убыванию → сброс', () => {
    const a = nextSort(null, 'name');
    expect(a).toEqual({ key: 'name', dir: 'asc' });
    const b = nextSort(a, 'name');
    expect(b).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort(b, 'name')).toBeNull();
    expect(nextSort(b, 'other')).toEqual({ key: 'other', dir: 'asc' });
  });

  const rows = [
    { id: 1, name: 'Яковлев', n: 3 as number | null },
    { id: 2, name: 'Абрамов', n: null },
    { id: 3, name: 'Борисов', n: 10 },
    { id: 4, name: 'Васильев', n: 2 },
  ];
  const value = (r: (typeof rows)[number], key: string) => (key === 'name' ? r.name : r.n);

  it('строки сортируются по-русски, пустые — в конце при любом направлении', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, value).map((r) => r.id)).toEqual([2, 3, 4, 1]);
    expect(sortRows(rows, { key: 'name', dir: 'desc' }, value).map((r) => r.id)).toEqual([1, 4, 3, 2]);
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, value).map((r) => r.id)).toEqual([4, 1, 3, 2]);
    expect(sortRows(rows, { key: 'n', dir: 'desc' }, value).map((r) => r.id)).toEqual([3, 1, 4, 2]);
  });

  it('без сортировки порядок сохраняется, исходный массив не меняется', () => {
    const copy = sortRows(rows, null, value);
    expect(copy.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(copy).not.toBe(rows);
  });
});
