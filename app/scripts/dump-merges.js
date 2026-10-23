// node scripts/dump-merges.js <file> <sheetIdx> <rowFrom> <rowTo>
const E = require('exceljs');
(async () => {
  const [f, si, a, b] = process.argv.slice(2);
  const wb = new E.Workbook(); await wb.xlsx.readFile(f);
  const ws = wb.worksheets[Number(si)];
  const m = ws.model.merges || [];
  console.log(m.filter((x) => { const r = Number(x.match(/\d+/)[0]); return r >= a && r <= b; }).join(' '));
})();
