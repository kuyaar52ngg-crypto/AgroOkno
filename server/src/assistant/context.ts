// Контекст помощника: профиль/хозяйство, поголовье по группам, ближайшие сроки — от имени пользователя (RLS).
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadFarmData } from '../../../app/api/_lib/context';
import { computeDeadlineReminders } from '../../../app/src/reports/reminders';
import { balanceOn } from '../../../app/src/reports/period';
import type { FarmData } from '../../../app/src/reports/types';
import { GROUP_LABEL } from './answers';
import type { AssistantContext, LivestockGroup } from './types';

export function buildContext(data: FarmData, today: string, userName: string | null): AssistantContext {
  const balance = balanceOn(data.movements, today);
  const herd = (Object.keys(balance) as LivestockGroup[])
    .map((group) => ({ group, label: GROUP_LABEL[group] ?? group, heads: balance[group] ?? 0 }))
    .filter((h) => h.heads > 0);
  const f = data.farm;
  return {
    today,
    user_name: userName,
    farm: { id: f.id, name: f.name, legal_status: f.legal_status, settlement: f.settlement, region: f.region },
    herd,
    deadlines: computeDeadlineReminders({ data, today }),
  };
}

/** Загружает контекст; бросает ApiError(404), если хозяйства нет или нет доступа. */
export async function loadAssistantContext(
  supabase: SupabaseClient,
  farmId: string,
  userId: string,
  today: string,
): Promise<AssistantContext> {
  const data = await loadFarmData(supabase, farmId);
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  return buildContext(data, today, (profile?.full_name as string | null) ?? null);
}
