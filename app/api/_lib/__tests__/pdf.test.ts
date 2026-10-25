// PDF с кириллицей: квитанция и выписка из похозяйственной книги строятся без ошибок.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PDFDocument } from 'pdf-lib';

import { lphData } from '../../../src/reports/__tests__/fixtures';
import { planHorriotSync } from '../../../src/reports/horriot';
import { ALL_GROUPS } from '../../../src/reports/period';
import type { FarmData, HorriotInfo } from '../../../src/reports/types';
import { buildExtractPdf, buildReceiptPdf, fmtYakutsk } from '../documents';

/** Данные ЛПХ с id записей журнала и сведениями «Хорриота» (все записи переданы или не подключено). */
function withHorriot(connected: boolean): FarmData {
  const data = lphData();
  data.movements = data.movements.map((m, i) => ({ ...m, id: `m${i + 1}` }));
  const planned = connected
    ? planHorriotSync(data.movements.map((m) => ({ id: m.id!, occurred_on: m.occurred_on, animal_group: m.animal_group, kind: m.kind, heads: m.heads })), [], new Set())
    : [];
  const horriot: HorriotInfo = {
    status: connected ? 'connected_demo' : 'not_connected',
    synced_at: connected ? '2026-10-23T01:00:00Z' : null,
    records: planned.map((p) => ({ kind: p.kind, animal_group: p.animal_group, heads: p.heads, registered_on: p.registered_on, source_movement_id: p.source_movement_id })),
  };
  return { ...data, horriot };
}

describe('PDF', () => {
  it('время в часовом поясе Якутска', () => {
    assert.equal(fmtYakutsk('2026-10-15T01:15:00Z'), '15.10.2026, 10:15');
  });

  it('квитанция — валидный PDF', async () => {
    const file = await buildReceiptPdf({
      receipt_no: 'УЧ-ТАБУН-2026-023',
      form_code: '1-tabun',
      period: { year: 2026, month: 10 },
      recipient: 'Сахастат',
      submitted_at: '2026-10-23T00:41:00Z',
      farm_name: 'ЛПХ Ивановых',
    });
    assert.equal(file.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(file.length > 3000);
  });

  it('выписка из книги — валидный PDF', async () => {
    const file = await buildExtractPdf(lphData(), '2026-10-23');
    assert.equal(file.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(file.length > 3000);
  });

  it('выписка: раздел «Хорриот» (подключено / не подключено) добавляет сведения в документ', async () => {
    const plain = await buildExtractPdf(lphData(), '2026-10-23');
    const connected = await buildExtractPdf(withHorriot(true), '2026-10-23');
    const notConnected = await buildExtractPdf(withHorriot(false), '2026-10-23');
    for (const file of [connected, notConnected]) assert.equal(file.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(connected.length > plain.length && notConnected.length > plain.length);
  });

  it('выписка: длинный раздел переносится на вторую страницу, а не обрезается', async () => {
    const data = withHorriot(true);
    data.movements = ALL_GROUPS.map((g, i) => ({ id: `g${i}`, occurred_on: '2026-01-01', animal_group: g, kind: 'opening_balance', heads: 5 + i, live_weight_kg: null, amount_rub: null }));
    data.horriot = { ...data.horriot!, records: [] };
    data.members = Array.from({ length: 8 }, (_, i) => ({ full_name: `Иванов Член ${i + 1}`, is_head: i === 0 }));
    const file = await buildExtractPdf(data, '2026-10-23');
    const doc = await PDFDocument.load(file);
    assert.ok(doc.getPageCount() >= 2, `страниц: ${doc.getPageCount()}`);
    const short = await PDFDocument.load(await buildExtractPdf(lphData(), '2026-10-23'));
    assert.equal(short.getPageCount(), 1);
  });
});
