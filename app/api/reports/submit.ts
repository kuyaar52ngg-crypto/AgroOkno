// POST /api/reports/submit  { farm_id, form, year, month? }
// Authorization: Bearer <access_token>
// Демо-отправка: проверка периода и прав (RLS), снимок отчёта, квитанция УЧ-<ФОРМА>-<ГОД>-<NNN>, уведомление.
// Реальной передачи в ведомства нет. Отправленный период больше не пересчитывается (хранится снимок).
import type { FormCode } from '../../src/data/contract';
import { DEADLINES, isMonthly } from '../../src/reports/deadlines';
import { buildPreview, toSnapshot } from '../../src/reports/engine';
import { monthStart } from '../../src/reports/period';
import { ApiError, bearerToken, guard, loadFarmData, todayInYakutsk, userClient, UUID_RE } from '../_lib/context';

interface Body {
  farm_id?: string;
  form?: string;
  year?: number;
  month?: number | null;
}

export const POST = (request: Request) =>
  guard(async () => {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      throw new ApiError(400, 'Некорректное тело запроса');
    }
    const form = body.form as FormCode;
    if (!body.farm_id || !UUID_RE.test(body.farm_id)) throw new ApiError(400, 'Не указано хозяйство (farm_id)');
    if (!form || !(form in DEADLINES)) throw new ApiError(400, 'Неизвестная форма отчёта');
    const year = Number(body.year);
    const month = body.month ? Number(body.month) : undefined;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, 'Некорректный год отчётного периода');
    if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new ApiError(400, 'Некорректный месяц отчётного периода');
    }

    const supabase = userClient(bearerToken(request));
    const data = await loadFarmData(supabase, body.farm_id);
    const monthly = isMonthly(form, data.farm.legal_status);
    if (monthly && !month) throw new ApiError(400, 'Для этой формы нужен месяц отчётного периода');
    if (!monthly && month) throw new ApiError(400, 'Эта форма годовая: месяц не нужен');

    const today = todayInYakutsk();
    const period = month ? { year, month } : { year };
    if (monthStart(year, month ?? 1) > today) throw new ApiError(422, 'Отчётный период ещё не начался');

    const preview = buildPreview({ data, today }, form, period);
    if (preview.obligation.status === 'submitted') {
      throw new ApiError(409, `Отчёт за этот период уже отправлен (квитанция ${preview.obligation.receipt_no})`);
    }

    const { data: rows, error } = await supabase.rpc('submit_report', {
      p_farm_id: body.farm_id,
      p_form_code: form,
      p_year: year,
      p_month: month ?? null,
      p_snapshot: toSnapshot(preview),
    });
    if (error) {
      if (error.code === '23505') throw new ApiError(409, error.message);
      if (error.code === '42501') throw new ApiError(403, 'Нет доступа к хозяйству');
      throw new ApiError(500, `Не удалось отправить отчёт: ${error.message}`);
    }
    const r = Array.isArray(rows) ? rows[0] : rows;
    if (!r) throw new ApiError(500, 'Сервер не вернул квитанцию');
    return Response.json(
      {
        ok: true,
        receipt: {
          receipt_no: r.out_receipt_no,
          form_code: form,
          period,
          recipient: r.out_recipient,
          submitted_at: r.out_submitted_at,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
