/// <reference types="node" />
// Общие приёмы заполнения оригинальных XLSX-бланков через exceljs.
import path from 'node:path';
import ExcelJS from 'exceljs';
import { templatesDir } from './templates';

export const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export const templatePath = (file: string) => path.join(templatesDir(), file);

export async function openTemplate(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath(file));
  return wb;
}

/** Ячейки «Х» в бланке означают «не заполняется» — их не трогаем. */
function isNotApplicable(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  return typeof v === 'string' && ['х', 'x'].includes(v.trim().toLowerCase());
}

/** Пишет значение; пустые и нулевые значения не пишем — пустая ячейка означает «нет». */
export function put(ws: ExcelJS.Worksheet, address: string, value: number | string | null | undefined): void {
  if (value === undefined || value === null || value === 0 || value === '') return;
  const cell = ws.getCell(address);
  if (isNotApplicable(cell)) return;
  cell.value = value;
}

/** Строка, в которой в одной из колонок стоит указанный код строки формы. */
export function findRowByCode(ws: ExcelJS.Worksheet, codeCols: string[], code: string): { row: number; codeCol: string } | null {
  for (let r = 1; r <= ws.rowCount; r++) {
    for (const col of codeCols) {
      const v = ws.getCell(`${col}${r}`).value;
      if ((typeof v === 'string' || typeof v === 'number') && String(v).trim() === code) return { row: r, codeCol: col };
    }
  }
  return null;
}

/** Индекс кода → строка: один проход по листу вместо поиска на каждый код. */
export function indexCodes(ws: ExcelJS.Worksheet, codeCol: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let r = 1; r <= ws.rowCount; r++) {
    const v = ws.getCell(`${codeCol}${r}`).value;
    if ((typeof v === 'string' || typeof v === 'number') && !map.has(String(v).trim())) map.set(String(v).trim(), r);
  }
  return map;
}

export const yy = (year: number) => String(year % 100).padStart(2, '0');

export interface HeaderInfo {
  farmName: string;
  address: string | null;
  okpo: string | null;
  inn: string | null;
  headName: string | null;
  headPosition: string;
  compiledOn: Date;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}
