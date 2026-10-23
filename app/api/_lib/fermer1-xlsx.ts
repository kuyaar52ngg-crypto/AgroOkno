/// <reference types="node" />
// Заполнение бланка 1-фермер: лист «стр.1» (титул) и «стр.2_3» (графа 1, колонка DX).
import { FERMER1_SHEET_ROW, type Fermer1Result } from '../../src/reports/fermer1';
import { MONTHS_GENITIVE, openTemplate, put, toBuffer, yy, type HeaderInfo } from './xlsx-helpers';

export async function renderFermer1Xlsx(result: Fermer1Result, year: number, h: HeaderInfo): Promise<Buffer> {
  const wb = await openTemplate('1-fermer.xlsx');
  const [title, body] = wb.worksheets;

  put(title, 'BZ11', yy(year));
  put(title, 'AV27', h.farmName);
  put(title, 'S29', h.address);
  put(title, 'V34', h.okpo);

  for (const [line, ha] of Object.entries(result.lines)) {
    const row = FERMER1_SHEET_ROW[Number(line)];
    if (row) put(body, `DX${row}`, ha);
  }

  put(body, 'BB62', h.headPosition);
  put(body, 'CH62', h.headName);
  put(body, 'DP66', h.compiledOn.getDate());
  put(body, 'DV66', MONTHS_GENITIVE[h.compiledOn.getMonth()]);
  put(body, 'EK66', yy(h.compiledOn.getFullYear()));
  return toBuffer(wb);
}
