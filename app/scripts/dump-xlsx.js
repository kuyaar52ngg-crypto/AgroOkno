// Выводит непустые ячейки листов XLSX-бланка: node scripts/dump-xlsx.js <file> [sheetIndex]
const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const only = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
  wb.worksheets.forEach((ws, i) => {
    if (only !== null && i !== only) return;
    console.log(`=== [${i}] ${ws.name} rows=${ws.rowCount} cols=${ws.columnCount}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const parts = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.isMerged && cell.master.address !== cell.address) return;
        let v = cell.value;
        if (v && typeof v === 'object') v = v.richText ? v.richText.map((r) => r.text).join('') : v.formula ? `={${v.formula}}` : JSON.stringify(v);
        v = String(v).replace(/\s+/g, ' ').trim();
        if (v) parts.push(`${cell.address}:${v.slice(0, 90)}`);
      });
      if (parts.length) console.log(parts.join(' | '));
    });
  });
})();
