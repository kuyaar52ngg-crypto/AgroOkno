// Проверка заполнения официальных бланков: рендер на тестовых данных и чтение ячеек обратно.
// Запуск из каталога app (шаблоны ищутся в ./templates): npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';

import { computeFermer1 } from '../../../src/reports/fermer1';
import { computeFermer2 } from '../../../src/reports/fermer2';
import { buildFermer3Input, computeFermer3 } from '../../../src/reports/fermer3';
import { computeKfh1 } from '../../../src/reports/kfh1';
import { computeIp1 } from '../../../src/reports/ip1';
import { kfhData, lphData } from '../../../src/reports/__tests__/fixtures';
import { renderFermer1Xlsx } from '../fermer1-xlsx';
import { renderFermer2Xlsx } from '../fermer2-xlsx';
import { renderFermer3Xlsx } from '../fermer3-xlsx';
import { renderMinselhozXlsx } from '../minselhoz-xlsx';
import type { HeaderInfo } from '../xlsx-helpers';

const header: HeaderInfo = {
  farmName: 'КФХ «Эрилик»',
  address: 'с. Хатассы',
  okpo: '12345678',
  inn: '143500987654',
  headName: 'Петров Пётр Петрович',
  headPosition: 'Глава КФХ',
  compiledOn: new Date(2026, 9, 23),
};

async function open(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
}

const val = (wb: ExcelJS.Workbook, sheet: number, addr: string) => wb.worksheets[sheet].getCell(addr).value;

describe('XLSX-бланки', () => {
  it('3-фермер: сентябрь ЛПХ — лошади 29 в разделе 2, надой в разделе 1', async () => {
    const period = { year: 2026, month: 9 };
    const result = computeFermer3(buildFermer3Input(lphData(), period));
    const wb = await open(
      await renderFermer3Xlsx(result, {
        farmName: 'ЛПХ Ивановых', address: null, okpo: null, headName: 'Иван Иванов', headPosition: 'Глава ЛПХ', period, compiledOn: new Date(2026, 9, 16),
      }),
    );
    assert.equal(val(wb, 2, 'CD16'), 29);
    assert.equal(val(wb, 1, 'CY18'), 11.1);
    assert.equal(val(wb, 0, 'BB28'), 'ЛПХ Ивановых');
  });

  it('1-фермер: площади по строкам формы', async () => {
    const wb = await open(await renderFermer1Xlsx(computeFermer1(kfhData(), 2025), 2025, header));
    assert.equal(val(wb, 1, 'DX17'), 2); // строка 8: яровая пшеница
    assert.equal(val(wb, 1, 'DX31'), 0.8); // строка 18: картофель
    assert.equal(val(wb, 0, 'AV27'), 'КФХ «Эрилик»');
  });

  it('2-фермер: сбор ячменя по коду 1112 и картофеля по коду 1301', async () => {
    const wb = await open(await renderFermer2Xlsx(computeFermer2(kfhData(), 2025), 2025, header));
    const ws = wb.worksheets[1];
    let barleyRow = 0;
    let potatoRow = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getCell(`AU${r}`).value) === '1112') barleyRow = r;
      if (String(ws.getCell(`AU${r}`).value) === '1301') potatoRow = r;
    }
    assert.ok(barleyRow > 0 && potatoRow > 0);
    assert.equal(ws.getCell(`BW${barleyRow}`).value, 6);
    assert.equal(ws.getCell(`DG${barleyRow}`).value, 126);
    assert.equal(ws.getCell(`EU${barleyRow}`).value, 21);
    assert.equal(ws.getCell(`DG${potatoRow}`).value, 144);
  });

  for (const kind of ['kfh', 'ip'] as const) {
    it(`1-${kind === 'kfh' ? 'КФХ' : 'ИП'}: доходы, продукция, поголовье и подпись`, async () => {
      const compute = kind === 'kfh' ? computeKfh1 : computeIp1;
      const prefix = kind === 'kfh' ? '23' : '24';
      const wb = await open(await renderMinselhozXlsx(kind, compute(kfhData(), 2025), header));
      const find = (sheet: number, col: string, code: string) => {
        const ws = wb.worksheets[sheet];
        for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(`${col}${r}`).value) === code) return r;
        return 0;
      };
      const incomeCol = kind === 'kfh' ? 'BN' : 'BL';
      const incomeRow = find(0, incomeCol, `${prefix}1100`);
      assert.ok(incomeRow > 0);
      assert.equal(wb.worksheets[0].getCell(`${kind === 'kfh' ? 'BY' : 'BW'}${incomeRow}`).value, 1080);

      const lsSheet = kind === 'kfh' ? 4 : 5;
      const lsCol = kind === 'kfh' ? 'AU' : 'AL';
      const milkRow = find(lsSheet, lsCol, `${prefix}6120`);
      assert.ok(milkRow > 0);
      assert.equal(wb.worksheets[lsSheet].getCell(`${kind === 'kfh' ? 'BQ' : 'BC'}${milkRow}`).value, 106);
      const horsesRow = find(lsSheet, lsCol, `${prefix}6290`);
      assert.equal(wb.worksheets[lsSheet].getCell(`${kind === 'kfh' ? 'BZ' : 'BJ'}${horsesRow}`).value, 70);

      const cropsCol = kind === 'kfh' ? 'AK' : 'AN';
      const potatoRow = find(2, cropsCol, `${prefix}5153`);
      assert.equal(wb.worksheets[2].getCell(`${kind === 'kfh' ? 'CA' : 'CG'}${potatoRow}`).value, 144);
    });
  }
});
