// Для листа: по каждой строке с числом в колонке «№ строки» (найденной по заголовку) печатает метки и мастер-ячейки значений.
// node scripts/dump-rows.js <file> <sheetIdx> <lineCol> [valueColsCsv]
const ExcelJS = require('exceljs');
(async () => {
  const [file, si, lineCol, cols] = process.argv.slice(2);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[Number(si)];
  const vc = (cols || '').split(',').filter(Boolean);
  ws.eachRow((row, rn) => {
    const lc = ws.getCell(`${lineCol}${rn}`);
    const v = lc.value;
    if (v === null || v === undefined || v === '') return;
    const label = [];
    row.eachCell((c) => {
      if (c.address.startsWith(lineCol) ) return;
      let t = c.value; if (t && t.richText) t = t.richText.map(r=>r.text).join('');
      if (typeof t === 'string' && t.trim().length > 2 && !(c.isMerged && c.master.address !== c.address)) label.push(t.trim().slice(0,60));
    });
    const masters = vc.map((col) => { const c = ws.getCell(`${col}${rn}`); return `${col}${rn}->${c.master.address}`; });
    console.log(`row ${rn} line=${JSON.stringify(v)} | ${label.join(' / ')} | ${masters.join(' ')}`);
  });
})();
