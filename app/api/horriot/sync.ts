// POST /api/horriot/sync  { farm_id }
// Authorization: Bearer <access_token>
// Демо-передача данных в «Хорриот» (ФГИС ВетИС): каждая запись журнала поголовья без записи в Хорриоте превращается
// в учебную запись УЧ-ХР-NNN (регистрация / выбытие). Идемпотентно по source_movement_id. Реальной интеграции нет.
import { planHorriotSync, type HorriotSource } from '../../src/reports/horriot';
import { ApiError, bearerToken, guard, selectAll, userClient, UUID_RE } from '../_lib/context';

export const POST = (request: Request) =>
  guard(async () => {
    const body = (await request.json().catch(() => ({}))) as { farm_id?: string };
    if (!body.farm_id || !UUID_RE.test(body.farm_id)) throw new ApiError(400, 'Не указано хозяйство (farm_id)');
    const farmId = body.farm_id;
    const supabase = userClient(bearerToken(request));

    const { data: farm } = await supabase.from('farms').select('id').eq('id', farmId).is('deleted_at', null).maybeSingle();
    if (!farm) throw new ApiError(404, 'Хозяйство не найдено или нет доступа');
    const { data: conn, error: connError } = await supabase.from('horriot_connections').select('status').eq('farm_id', farmId).is('deleted_at', null).maybeSingle();
    if (connError) throw new ApiError(500, `Не удалось прочитать подключение: ${connError.message}`);
    if (conn?.status !== 'connected_demo') throw new ApiError(409, 'Хорриот не подключён. Сначала подключите демо-режим');

    const [movements, records] = await Promise.all([
      selectAll<Record<string, unknown>>(supabase, 'livestock_movements', 'id, occurred_on, animal_group, kind, heads', farmId),
      selectAll<Record<string, unknown>>(supabase, 'horriot_records', 'number, source_movement_id', farmId),
    ]);

    const sources: HorriotSource[] = movements.map((m) => ({
      id: m.id as string,
      occurred_on: m.occurred_on as string,
      animal_group: m.animal_group as HorriotSource['animal_group'],
      kind: m.kind as HorriotSource['kind'],
      heads: Number(m.heads),
    }));
    const registered = new Set(records.map((r) => r.source_movement_id as string | null).filter((x): x is string => !!x));
    const planned = planHorriotSync(
      sources,
      records.map((r) => String(r.number)),
      registered,
    );

    if (planned.length > 0) {
      const { error } = await supabase.from('horriot_records').insert(
        planned.map(({ group_label: _label, ...fields }) => {
          void _label;
          return { ...fields, farm_id: farmId };
        }),
      );
      if (error) {
        if (error.code === '23505') throw new ApiError(409, 'Данные уже передаются в Хорриот. Повторите через минуту');
        throw new ApiError(500, `Не удалось создать записи: ${error.message}`);
      }
    }
    const syncedAt = new Date().toISOString();
    const { error: updError } = await supabase.from('horriot_connections').update({ synced_at: syncedAt }).eq('farm_id', farmId);
    if (updError) throw new ApiError(500, `Не удалось обновить время синхронизации: ${updError.message}`);
    return Response.json({ ok: true, created: planned.length, synced_at: syncedAt }, { headers: { 'Cache-Control': 'no-store' } });
  });
