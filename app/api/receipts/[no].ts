// GET /api/receipts/<номер квитанции>  — PDF учебной квитанции (например, УЧ-ТАБУН-2026-023).
// Authorization: Bearer <access_token> или ?access_token=… (ссылка на скачивание).
import type { FormCode } from '../../src/data/contract';
import { ApiError, bearerToken, guard, userClient } from '../_lib/context';
import { buildReceiptPdf } from '../_lib/documents';
import { pdfResponse } from '../_lib/pdf';

export const GET = (request: Request) =>
  guard(async () => {
    const segment = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
    const no = decodeURIComponent(segment).replace(/\.pdf$/i, '');
    if (!/^УЧ-[0-9A-Za-zА-Яа-яЁё]{1,12}-\d{4}-\d{3,}$/.test(no)) throw new ApiError(400, 'Некорректный номер квитанции');

    const supabase = userClient(bearerToken(request));
    const { data: sub, error } = await supabase
      .from('report_submissions')
      .select('farm_id, form_code, period_year, period_month, recipient, receipt_no, submitted_at')
      .eq('receipt_no', no)
      .eq('status', 'submitted')
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new ApiError(500, `Не удалось найти квитанцию: ${error.message}`);
    if (!sub) throw new ApiError(404, 'Квитанция не найдена или нет доступа');

    const { data: farm } = await supabase.from('farms').select('name').eq('id', sub.farm_id).maybeSingle();
    const file = await buildReceiptPdf({
      receipt_no: sub.receipt_no as string,
      form_code: sub.form_code as FormCode,
      period: sub.period_month ? { year: sub.period_year, month: sub.period_month } : { year: sub.period_year },
      recipient: (sub.recipient as string | null) ?? '—',
      submitted_at: sub.submitted_at as string,
      farm_name: farm?.name ?? '—',
    });
    return pdfResponse(file, `${no}.pdf`);
  });
