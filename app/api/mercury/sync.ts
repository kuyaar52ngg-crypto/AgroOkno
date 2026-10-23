// POST /api/mercury/sync  { farm_id }
// Authorization: Bearer <access_token>
// Демо-синхронизация «Меркурия»: из продаж с mercury_status draft/pending создаёт учебные
// ветеринарные документы УЧ-ВСД-NNN, переводит источники в «issued», обновляет время синхронизации.
import { planMercurySync, type MercurySource } from '../../src/reports/mercury';
import { ApiError, bearerToken, guard, todayInYakutsk, userClient, UUID_RE } from '../_lib/context';

export const POST = (request: Request) =>
  guard(async () => {
    const body = (await request.json().catch(() => ({}))) as { farm_id?: string };
    if (!body.farm_id || !UUID_RE.test(body.farm_id)) throw new ApiError(400, 'Не указано хозяйство (farm_id)');
    const farmId = body.farm_id;
    const supabase = userClient(bearerToken(request));

    const { data: farm } = await supabase.from('farms').select('name').eq('id', farmId).is('deleted_at', null).maybeSingle();
    if (!farm) throw new ApiError(404, 'Хозяйство не найдено или нет доступа');
    const { data: conn } = await supabase.from('mercury_connections').select('status').eq('farm_id', farmId).maybeSingle();
    if (conn?.status !== 'connected_demo') throw new ApiError(409, 'Меркурий не подключён. Сначала подключите демо-режим');

    const [sales, moves, docs] = await Promise.all([
      supabase
        .from('product_sales')
        .select('id, occurred_on, product, quantity, buyer, destination, mercury_status')
        .eq('farm_id', farmId)
        .is('deleted_at', null)
        .in('mercury_status', ['draft', 'pending']),
      supabase
        .from('livestock_movements')
        .select('id, occurred_on, animal_group, heads, counterparty, destination, mercury_status, kind')
        .eq('farm_id', farmId)
        .is('deleted_at', null)
        .in('mercury_status', ['draft', 'pending'])
        .in('kind', ['sale', 'sale_slaughter', 'transfer_out']),
      supabase.from('mercury_documents').select('number, source_id').eq('farm_id', farmId),
    ]);
    const failed = [sales, moves, docs].find((r) => r.error);
    if (failed?.error) throw new ApiError(500, `Не удалось прочитать данные: ${failed.error.message}`);

    const sources: MercurySource[] = [
      ...(sales.data ?? []).map(
        (s): MercurySource => ({
          kind: 'product_sale',
          id: s.id,
          occurred_on: s.occurred_on,
          product: s.product,
          quantity: Number(s.quantity),
          counterparty: s.buyer,
          destination: s.destination,
          mercury_status: s.mercury_status,
        }),
      ),
      ...(moves.data ?? []).map(
        (m): MercurySource => ({
          kind: 'livestock',
          id: m.id,
          occurred_on: m.occurred_on,
          group: m.animal_group,
          quantity: Number(m.heads),
          counterparty: m.counterparty,
          destination: m.destination,
          mercury_status: m.mercury_status,
        }),
      ),
    ];
    const issuedIds = new Set((docs.data ?? []).map((d) => d.source_id).filter((x): x is string => !!x));
    const planned = planMercurySync(sources, (docs.data ?? []).map((d) => d.number), issuedIds, farm.name, todayInYakutsk());

    if (planned.length > 0) {
      const { error } = await supabase.from('mercury_documents').insert(planned.map((d) => ({ ...d, farm_id: farmId })));
      if (error) throw new ApiError(500, `Не удалось создать документы: ${error.message}`);
      for (const d of planned) {
        const table = d.source_kind === 'product_sale' ? 'product_sales' : 'livestock_movements';
        const { error: upd } = await supabase.from(table).update({ mercury_status: 'issued', mercury_vsd_id: d.number }).eq('id', d.source_id);
        if (upd) throw new ApiError(500, `Не удалось обновить статус записи: ${upd.message}`);
      }
    }
    const syncedAt = new Date().toISOString();
    await supabase.from('mercury_connections').update({ synced_at: syncedAt }).eq('farm_id', farmId);
    return Response.json({ ok: true, created: planned.length, synced_at: syncedAt }, { headers: { 'Cache-Control': 'no-store' } });
  });
