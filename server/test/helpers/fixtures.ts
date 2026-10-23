// Данные демо-ЛПХ для тестов сервера: берутся из фикстур мапперов приложения.
import { lphData } from '../../../app/src/reports/__tests__/fixtures';
import type { FarmData } from '../../../app/src/reports/types';
import { buildContext } from '../../src/assistant/context';
import type { AssistantContext } from '../../src/assistant/types';
import { FakeDb } from './fakeSupabase';

export const TODAY = '2026-10-23';
export const FARM_ID = 'f0000000-0000-4000-8000-000000000001';
export const USER_ID = 'a0000000-0000-4000-8000-000000000001';

export function demoContext(): AssistantContext {
  return buildContext(lphData(), TODAY, 'Иван Иванов');
}

/** Заполняет FakeDb строками таблиц из FarmData (как их вернул бы Supabase). */
export function seedFarm(data: FarmData = lphData(), farmId = FARM_ID, members: string[] = [USER_ID]): FakeDb {
  const withFarm = <T extends object>(rows: T[]): Record<string, unknown>[] => rows.map((r) => ({ ...r, farm_id: farmId, deleted_at: null }));
  return new FakeDb({
    farms: [{ ...data.farm, id: farmId, deleted_at: null }],
    farm_members: members.map((user_id) => ({ farm_id: farmId, user_id, role: 'owner' })),
    livestock_movements: withFarm(data.movements),
    product_outputs: withFarm(data.outputs),
    product_sales: withFarm(data.sales),
    feed_events: withFarm(data.feed),
    crop_events: withFarm(data.crops),
    household_members: withFarm(data.members),
    report_submissions: withFarm(data.submissions),
    user_settings: [],
    notifications: [],
    chat_messages: [],
    push_tokens: [],
    reminder_log: [],
  });
}
