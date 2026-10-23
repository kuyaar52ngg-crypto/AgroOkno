/// <reference types="node" />
// Заполнение оригинального XLSX-бланка формы 3-фермер по результату computeFermer3.
// Адреса — левые верхние ячейки объединённых полей бланка Росстата.
import path from 'node:path';
import ExcelJS from 'exceljs';
import { templatesDir } from './templates';
import type { Fermer3Result, Section3Column } from '../../src/reports/fermer3';

const template = () => path.join(templatesDir(), '3-fermer.xlsx');

/** Раздел 1, лист «стр.2», колонка «Произведено». */
const PRODUCED_ROW: Record<string, number> = {
  '01': 5, '02': 6, '03': 8, '04': 9, '05': 10, '06': 14, '07': 15, '07.2': 17,
  '08': 18, '09': 19, '10': 20, '12': 22, '14': 24, '16': 28,
};

/** Раздел 2, лист «стр.3», колонка «Наличие на конец периода». */
const HERD_ROW: Record<string, number> = {
  '21': 5, '22': 6, '25': 9, '26': 10, '28': 14, '30': 16, '31': 17, '34': 25, '36': 27,
};

/** Разделы 3 и 4, лист «стр.4_5». */
const MOVEMENT_ROW: Record<string, number> = { '44': 5, '46': 7, '47': 8, '48': 9, '49': 10 };
const MOVEMENT_COL: Record<Section3Column, string> = {
  cattle: 'BZ', pigs: 'CO', sheep_goats: 'DD', poultry: 'DS', horses: 'EH',
};
const SOLD_ROW: Record<string, number> = {
  '50': 16, '51': 17, '52': 19, '53': 20, '54': 21, '55': 22, '56': 23, '57': 24, '58': 25, '59': 28,
};

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_NOMINATIVE = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

export interface Fermer3Header {
  farmName: string;
  address: string | null;
  okpo: string | null;
  headName: string | null;
  headPosition: string;
  /** Отчётный период: целый год или один месяц. */
  period: { year: number; month?: number };
  compiledOn: Date;
}

export async function renderFermer3Xlsx(result: Fermer3Result, header: Fermer3Header): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(template());
  const [title, s1, s2, s34] = wb.worksheets;

  // Титульный лист. Ежемесячная версия — тот же бланк с периодом «за <месяц> 20__».
  const yy = String(header.period.year % 100).padStart(2, '0');
  if (header.period.month) {
    title.getCell('BU12').value = `за ${MONTHS_NOMINATIVE[header.period.month - 1]} 20`;
    title.getCell('DQ26').value = 'Месячная';
  }
  title.getCell('CB12').value = yy;
  title.getCell('BB28').value = header.farmName;
  if (header.address) title.getCell('Y30').value = header.address;
  if (header.okpo) title.getCell('X36').value = header.okpo;

  const put = (ws: ExcelJS.Worksheet, address: string, value: number | undefined) => {
    if (value) ws.getCell(address).value = value; // нули не пишем — пустая ячейка означает «нет»
  };

  for (const [code, row] of Object.entries(PRODUCED_ROW)) put(s1, `CY${row}`, result.produced[code]);
  for (const [code, row] of Object.entries(HERD_ROW)) put(s2, `CD${row}`, result.herd[code]);
  for (const [code, row] of Object.entries(MOVEMENT_ROW)) {
    for (const [col, letter] of Object.entries(MOVEMENT_COL)) {
      put(s34, `${letter}${row}`, result.movement[code]?.[col as Section3Column]);
    }
  }
  for (const [code, row] of Object.entries(SOLD_ROW)) put(s34, `DV${row}`, result.sold[code]);

  // Подпись и дата составления.
  s34.getCell('BD45').value = header.headPosition;
  if (header.headName) s34.getCell('CJ45').value = header.headName;
  s34.getCell('DR49').value = header.compiledOn.getDate();
  s34.getCell('DX49').value = MONTHS_GENITIVE[header.compiledOn.getMonth()];
  s34.getCell('EM49').value = String(header.compiledOn.getFullYear() % 100).padStart(2, '0');

  return Buffer.from(await wb.xlsx.writeBuffer());
}
