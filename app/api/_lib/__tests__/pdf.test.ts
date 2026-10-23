// PDF с кириллицей: квитанция и выписка из похозяйственной книги строятся без ошибок.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lphData } from '../../../src/reports/__tests__/fixtures';
import { buildExtractPdf, buildReceiptPdf, fmtYakutsk } from '../documents';

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
});
