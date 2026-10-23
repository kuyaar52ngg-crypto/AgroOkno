/// <reference types="node" />
// Заполнение бланков Минсельхоза: 1-КФХ (коды 23xxxx) и 1-ИП (коды 24xxxx).
// Строки ищутся по коду (колонка «Коды»), значения пишутся в графы по адресам колонок бланка.
import type { MinselhozResult } from '../../src/reports/minselhoz';
import { indexCodes, MONTHS_GENITIVE, openTemplate, put, toBuffer, type HeaderInfo } from './xlsx-helpers';

interface Layout {
  file: string;
  prefix: string;
  /** Титул: название, ИНН, ОКПО, дата, количество единиц, заголовок «за … год». */
  title: { name: string; inn: string; okpo: string; date: string; count: string; headline: string };
  income: { sheet: number; codeCol: string; cur: string; prev: string };
  crops: { sheet: number; codeCol: string; sown: string; harvested: string; produced: string; yield: string; sold: string; income: string; price: string };
  livestock: {
    sheet: number;
    codeCol: string;
    produced: string;
    sold: string;
    income: string;
    price: string;
    headsStart: string;
    headsEnd: string;
    losses: string;
  };
  signature: { sheet: number; fio: string; day: string; month: string; year: string };
}

const KFH: Layout = {
  file: '1-kfh.xlsx',
  prefix: '23',
  title: { name: 'AH6', inn: 'AH7', okpo: 'BY6', date: 'BY5', count: 'BY14', headline: 'B2' },
  income: { sheet: 0, codeCol: 'BN', cur: 'BY', prev: 'CO' },
  crops: { sheet: 2, codeCol: 'AK', sown: 'AY', harvested: 'BM', produced: 'CA', yield: 'CI', sold: 'CX', income: 'DF', price: 'DM' },
  livestock: { sheet: 4, codeCol: 'AU', produced: 'BQ', sold: 'CG', income: 'CN', price: 'CU', headsStart: 'BA', headsEnd: 'BZ', losses: 'BA' },
  signature: { sheet: 5, fio: 'BR30', day: 'C35', month: 'H35', year: 'W35' },
};

const IP: Layout = {
  file: '1-ip.xlsx',
  prefix: '24',
  title: { name: 'AG6', inn: 'AG7', okpo: 'BW6', date: 'BW5', count: 'BW14', headline: 'B2' },
  income: { sheet: 0, codeCol: 'BL', cur: 'BW', prev: 'CM' },
  crops: { sheet: 2, codeCol: 'AN', sown: 'BC', harvested: 'BS', produced: 'CG', yield: 'CP', sold: 'DF', income: 'DN', price: 'DV' },
  livestock: { sheet: 5, codeCol: 'AL', produced: 'BC', sold: 'BP', income: 'BW', price: 'CC', headsStart: 'AQ', headsEnd: 'BJ', losses: 'AQ' },
  signature: { sheet: 6, fio: 'BN27', day: 'C31', month: 'H31', year: 'W31' },
};

export type MinselhozKind = 'kfh' | 'ip';

export async function renderMinselhozXlsx(kind: MinselhozKind, result: MinselhozResult, h: HeaderInfo): Promise<Buffer> {
  const L = kind === 'kfh' ? KFH : IP;
  const wb = await openTemplate(L.file);
  const code = (suffix: string) => `${L.prefix}${suffix}`;

  // Титул.
  const t = wb.worksheets[0];
  put(t, L.title.headline, `за ${result.year} год`);
  put(t, L.title.name, h.farmName);
  put(t, L.title.inn, h.inn);
  put(t, L.title.okpo, h.okpo);
  put(t, L.title.date, `${String(h.compiledOn.getDate()).padStart(2, '0')}.${String(h.compiledOn.getMonth() + 1).padStart(2, '0')}.${h.compiledOn.getFullYear()}`);
  put(t, L.title.count, 1);

  // Доходы (графы «за текущий год» и «за предыдущий»).
  const incomeWs = wb.worksheets[L.income.sheet];
  const incomeRows = indexCodes(incomeWs, L.income.codeCol);
  for (const [suffix, line] of Object.entries(result.income)) {
    const row = incomeRows.get(code(suffix));
    if (!row) continue;
    put(incomeWs, `${L.income.cur}${row}`, line.cur);
    put(incomeWs, `${L.income.prev}${row}`, line.prev);
  }

  // Растениеводство.
  const cropsWs = wb.worksheets[L.crops.sheet];
  const cropRows = indexCodes(cropsWs, L.crops.codeCol);
  for (const [suffix, line] of Object.entries(result.crops)) {
    const row = cropRows.get(code(suffix));
    if (!row) continue;
    put(cropsWs, `${L.crops.sown}${row}`, line.sown_ha);
    put(cropsWs, `${L.crops.harvested}${row}`, line.harvested_ha);
    put(cropsWs, `${L.crops.produced}${row}`, line.produced_c);
    put(cropsWs, `${L.crops.yield}${row}`, line.yield_c_ha);
    put(cropsWs, `${L.crops.sold}${row}`, line.sold_c);
    put(cropsWs, `${L.crops.income}${row}`, line.income_k);
    put(cropsWs, `${L.crops.price}${row}`, line.price_rub);
  }

  // Животноводство, поголовье и потери.
  const lsWs = wb.worksheets[L.livestock.sheet];
  const lsRows = indexCodes(lsWs, L.livestock.codeCol);
  for (const [suffix, line] of Object.entries(result.livestock)) {
    const row = lsRows.get(code(suffix));
    if (!row) continue;
    put(lsWs, `${L.livestock.produced}${row}`, line.produced_c);
    put(lsWs, `${L.livestock.sold}${row}`, line.sold_c);
    put(lsWs, `${L.livestock.income}${row}`, line.income_k);
    put(lsWs, `${L.livestock.price}${row}`, line.price_rub);
  }
  for (const [suffix, line] of Object.entries(result.heads)) {
    const row = lsRows.get(code(suffix));
    if (!row) continue;
    put(lsWs, `${L.livestock.headsStart}${row}`, line.start);
    put(lsWs, `${L.livestock.headsEnd}${row}`, line.end);
  }
  const lossRow = lsRows.get(code('6200'));
  if (lossRow) put(lsWs, `${L.livestock.losses}${lossRow}`, result.losses);

  // Подпись и дата.
  const sig = wb.worksheets[L.signature.sheet];
  put(sig, L.signature.fio, h.headName);
  put(sig, L.signature.day, h.compiledOn.getDate());
  put(sig, L.signature.month, MONTHS_GENITIVE[h.compiledOn.getMonth()]);
  put(sig, L.signature.year, String(h.compiledOn.getFullYear() % 100).padStart(2, '0'));
  return toBuffer(wb);
}
