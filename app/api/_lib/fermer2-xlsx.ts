/// <reference types="node" />
// Заполнение бланка 2-фермер, раздел 1 (лист «стр.2_4»): площади, сбор, урожайность по кодам строк.
// Коды строк стоят в колонке AU (верхняя таблица) или AV (нижняя), значения — в гр. 4, 5, 6, 8.
import type { Fermer2Result } from '../../src/reports/fermer2';
import { findRowByCode, MONTHS_GENITIVE, openTemplate, put, toBuffer, yy, type HeaderInfo } from './xlsx-helpers';

export async function renderFermer2Xlsx(result: Fermer2Result, year: number, h: HeaderInfo): Promise<Buffer> {
  const wb = await openTemplate('2-fermer.xlsx');
  const [title, crops, , last] = wb.worksheets;

  put(title, 'BZ12', yy(year));
  put(title, 'BB32', h.farmName);
  put(title, 'Y34', h.address);
  put(title, 'Y39', h.okpo);

  for (const [code, line] of Object.entries(result.lines)) {
    const found = findRowByCode(crops, ['AU', 'AV'], code);
    if (!found) continue;
    const sownCol = found.codeCol === 'AU' ? 'BW' : 'BX';
    put(crops, `${sownCol}${found.row}`, line.sown_ha);
    put(crops, `CP${found.row}`, line.harvested_ha);
    put(crops, `DG${found.row}`, line.gross_c);
    put(crops, `EU${found.row}`, line.yield_c_ha);
  }

  put(last, 'BI28', h.headPosition);
  put(last, 'CO28', h.headName);
  put(last, 'DW32', h.compiledOn.getDate());
  put(last, 'EC32', MONTHS_GENITIVE[h.compiledOn.getMonth()]);
  return toBuffer(wb);
}
