// Хуки DataModule поверх локальной БД: читают её синхронно и пересчитываются при любом изменении
// (запись пользователя, синхронизация, смена сессии).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { todayIso } from '../lib/clock';
import { buildDashboard, buildObligations, buildPreview } from '../reports/engine';
import { getEventDestinations as routeDestinations } from '../reports/routing';
import { balanceOn, kgToLiters, monthEnd, monthStart, sumHeads, inRange } from '../reports/period';
import { computeTabun1 } from '../reports/tabun1';
import { FAQ_ITEMS } from './faq';
import * as actions from './actions';
import { getVersion, subscribe } from './bus';
import type {
  AppNotification,
  AuthApi,
  DashboardSummary,
  Farm,
  FarmUpdate,
  FormCode,
  HerdGroup,
  HerdSummary,
  HorseHerd,
  Household,
  HouseholdExtract,
  HouseholdMember,
  IsoDate,
  JournalEntry,
  JournalFilter,
  JournalMonth,
  LivestockGroup,
  MercuryConnection,
  MercuryDocument,
  Mutation,
  NewEvent,
  NewHouseholdMember,
  NewSupportTicket,
  Profile,
  ProfileUpdate,
  Query,
  ReportObligation,
  ReportPeriod,
  ReportPreview,
  SubmitResult,
  SupportTicket,
  SyncStatus,
  UserSettings,
  Uuid,
  FaqItem,
} from './contract';
import {
  allEntries,
  currentFarm,
  currentFarmData,
  currentSettings,
  findEntry,
  toMember,
  toMercuryConnection,
  toMercuryDocument,
  toNotification,
  type EventType,
} from './entities';
import { lastSyncedAt, net } from './net';
import { currentFarmRow, session } from './session';
import { getDoc, pendingCount, rows } from './store';
import { retrySync } from './sync';
import { buildAuthApi } from './auth';

// ─── Общие обёртки ──────────────────────────────────────────────────────────

export function useVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Query поверх локальной БД. loading — только первая загрузка без кеша, fromCache — нет связи с сервером. */
export function useQ<T>(compute: () => T | undefined, deps: readonly unknown[], options: { noFarm?: boolean } = {}): Query<T> {
  const version = useVersion();
  const depsKey = JSON.stringify(deps);
  const data = useMemo(() => {
    if (session.status !== 'signed_in') return undefined;
    try {
      return compute();
    } catch (e) {
      console.warn('[data] ошибка расчёта запроса:', e instanceof Error ? e.message : e);
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, depsKey]);
  const hasCache = options.noFarm === true || currentFarmRow() !== undefined;
  const loading = session.status === 'loading' || (session.status === 'signed_in' && !hasCache && (net.syncing || !net.everSynced) && net.online);
  const fromCache = session.status === 'signed_in' && !net.online;
  const error = data === undefined && !loading && session.status === 'signed_in' && !hasCache && !net.online ? 'Нет подключения, сохранённых данных нет' : null;
  const refetch = useCallback(async () => {
    await retrySync();
  }, []);
  return { data, loading, fromCache, error, refetch };
}

export function useMut<I, O>(fn: (input: I) => O | Promise<O>): Mutation<I, O> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const run = useCallback(async (input: I): Promise<O> => {
    setPending(true);
    setError(null);
    try {
      return await ref.current(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
      throw e;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error };
}

// ─── Авторизация и синхронизация ────────────────────────────────────────────

export function useAuth(): AuthApi {
  const version = useVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildAuthApi(), [version]);
}

export function useSyncStatus(): SyncStatus {
  const version = useVersion();
  return useMemo(
    () => ({
      online: net.online,
      syncing: net.syncing,
      last_synced_at: lastSyncedAt(),
      pending_changes: pendingCount(),
      retry: retrySync,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
}

// ─── Хозяйство ──────────────────────────────────────────────────────────────

export const useFarm = (): Query<Farm> => useQ(() => currentFarm() ?? undefined, []);

export const useUpdateFarm = (): Mutation<FarmUpdate, Farm> => useMut((input: FarmUpdate) => actions.updateFarm(input));

export const useUpdateProfile = (): Mutation<ProfileUpdate, Profile> => useMut((patch: ProfileUpdate) => actions.updateProfile(patch));

export function useDashboard(): Query<DashboardSummary> {
  return useQ(() => {
    const data = currentFarmData();
    if (!data) return undefined;
    return { ...buildDashboard({ data, today: todayIso() }), updated_at: lastSyncedAt() };
  }, []);
}

// ─── Журнал ─────────────────────────────────────────────────────────────────

function sortEntries(list: JournalEntry[]): JournalEntry[] {
  return [...list].sort((a, b) =>
    a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on),
  );
}

function computeJournal(filter: JournalFilter): JournalMonth {
  const range = { from: monthStart(filter.year, filter.month), to: monthEnd(filter.year, filter.month) };
  const inMonth = allEntries().filter((e) => {
    if (!inRange(e.occurred_on, range)) return false;
    if (e.type === 'livestock' && e.kind === 'opening_balance') return false;
    return !filter.type || e.type === filter.type;
  });
  const milkKg = allEntries()
    .filter((e) => e.type === 'product_output' && e.product === 'milk' && inRange(e.occurred_on, range))
    .reduce((s, e) => s + (e.type === 'product_output' ? e.quantity : 0), 0);
  const data = currentFarmData();
  const today = todayIso();
  const on = range.to > today ? today : range.to;
  return {
    entries: sortEntries(inMonth),
    milk_l: kgToLiters(milkKg),
    total_heads: data ? sumHeads(balanceOn(data.movements, on)) : 0,
  };
}

export const useJournal = (filter: JournalFilter): Query<JournalMonth> =>
  useQ(() => computeJournal(filter), [filter.year, filter.month, filter.type]);

export const useJournalEntry = (id: Uuid): Query<JournalEntry | null> => useQ(() => findEntry(id), [id]);

export const useCreateEvent = (): Mutation<NewEvent, JournalEntry> => useMut((input: NewEvent) => actions.createEvent(input));

export const useUpdateEvent = (): Mutation<{ id: Uuid; input: NewEvent }, JournalEntry> =>
  useMut(({ id, input }: { id: Uuid; input: NewEvent }) => actions.updateEvent(id, input));

export const useDeleteEvent = (): Mutation<{ id: Uuid; type: JournalEntry['type'] }, void> =>
  useMut(({ id, type }: { id: Uuid; type: JournalEntry['type'] }) => actions.deleteEvent(id, type as EventType));

export const getEventDestinations = (input: NewEvent, farm: Farm | null) => routeDestinations(input, farm);

// ─── Поголовье ──────────────────────────────────────────────────────────────

const HERD_LABELS: Record<LivestockGroup, { label: string; hint: string }> = {
  cattle_cows: { label: 'Коровы', hint: 'Дойное поголовье' },
  cattle_calves: { label: 'Телята', hint: 'Молодняк КРС' },
  cattle_other: { label: 'КРС прочие', hint: 'Быки и нетели' },
  pigs_sows: { label: 'Свиноматки', hint: 'Свиньи' },
  pigs_other: { label: 'Свиньи прочие', hint: 'Свиньи' },
  sheep: { label: 'Овцы', hint: 'Взрослые и молодняк' },
  goats: { label: 'Козы', hint: 'Взрослые и молодняк' },
  horses_mares: { label: 'Кобылы', hint: 'Лошади' },
  horses_young: { label: 'Молодняк лошадей', hint: 'До 3 лет' },
  horses_stallions: { label: 'Жеребцы', hint: 'Взрослые жеребцы' },
  horses_other: { label: 'Лошади прочие', hint: 'Лошади' },
  deer: { label: 'Олени', hint: 'Северные олени' },
  poultry: { label: 'Птица', hint: 'Птица' },
  rabbits: { label: 'Кролики', hint: 'Кролики' },
};

const GROUP_ORDER: LivestockGroup[] = [
  'cattle_cows', 'cattle_calves', 'cattle_other', 'horses_mares', 'horses_young', 'horses_stallions', 'horses_other',
  'sheep', 'goats', 'pigs_sows', 'pigs_other', 'deer', 'poultry', 'rabbits',
];
const ALWAYS_SHOWN: LivestockGroup[] = ['cattle_cows', 'cattle_calves', 'horses_mares', 'horses_young', 'horses_stallions', 'sheep'];

export function computeHerd(on: IsoDate): HerdSummary {
  const data = currentFarmData();
  const balance = data ? balanceOn(data.movements, on) : {};
  const groups: HerdGroup[] = [];
  for (const group of GROUP_ORDER) {
    const heads = balance[group] ?? 0;
    if (heads > 0 || ALWAYS_SHOWN.includes(group)) {
      groups.push({ group, label: HERD_LABELS[group].label, hint: HERD_LABELS[group].hint, heads });
    }
  }
  return { on, total: groups.reduce((s, g) => s + g.heads, 0), groups };
}

export const useHerd = (on?: IsoDate): Query<HerdSummary> => useQ(() => computeHerd(on ?? todayIso()), [on]);

export const useHorseHerd = (period: { year: number; month: number }): Query<HorseHerd> =>
  useQ(() => {
    const data = currentFarmData();
    return data ? computeTabun1(data, period) : undefined;
  }, [period.year, period.month]);

// ─── Отчётность ─────────────────────────────────────────────────────────────

export const useReports = (year: number): Query<ReportObligation[]> =>
  useQ(() => {
    const data = currentFarmData();
    return data ? buildObligations({ data, today: todayIso() }, year) : undefined;
  }, [year]);

export const useReportPreview = (form: FormCode, period: ReportPeriod): Query<ReportPreview> =>
  useQ(() => {
    const data = currentFarmData();
    return data ? buildPreview({ data, today: todayIso() }, form, period) : undefined;
  }, [form, period.year, period.month]);

export const useSubmitReport = (): Mutation<{ form: FormCode; period: ReportPeriod }, SubmitResult> =>
  useMut(({ form, period }: { form: FormCode; period: ReportPeriod }) => actions.submitReport(form, period));

export const getReportDownloadUrl = (form: FormCode, period: ReportPeriod): Promise<string | null> => actions.reportDownloadUrl(form, period);
export const getReceiptUrl = (receiptNo: string): Promise<string> => actions.receiptUrl(receiptNo);

// ─── ЛПХ ────────────────────────────────────────────────────────────────────

export const useHousehold = (): Query<Household> =>
  useQ(() => {
    const farm = currentFarm();
    if (!farm) return undefined;
    const members: HouseholdMember[] = rows('household_members')
      .map(toMember)
      .sort((a, b) => Number(b.is_head) - Number(a.is_head));
    return { farm, members, livestock: computeHerd(todayIso()) };
  }, []);

export const useAddHouseholdMember = (): Mutation<NewHouseholdMember, HouseholdMember> =>
  useMut((input: NewHouseholdMember) => actions.addHouseholdMember(input));

export const useHouseholdExtract = (): Mutation<void, HouseholdExtract> => useMut(() => actions.householdExtract());

// ─── Меркурий ───────────────────────────────────────────────────────────────

export const useMercury = (): Query<{ connection: MercuryConnection; documents: MercuryDocument[] }> =>
  useQ(() => {
    const farm = currentFarmRow();
    if (!farm) return undefined;
    const connection = toMercuryConnection(getDoc('mercury_connections', String(farm.id))?.data);
    const documents = rows('mercury_documents')
      .map(toMercuryDocument)
      .sort((a, b) => (a.issued_on === b.issued_on ? b.number.localeCompare(a.number) : b.issued_on.localeCompare(a.issued_on)));
    return { connection, documents };
  }, []);

export const useMercuryDocument = (id: Uuid): Query<MercuryDocument | null> =>
  useQ(() => {
    const d = getDoc('mercury_documents', id);
    return d && !d.data.deleted_at ? toMercuryDocument(d.data) : null;
  }, [id]);

export const useMercuryConnect = (): Mutation<void, MercuryConnection> => useMut(() => actions.mercuryConnect());
export const useMercuryRefresh = (): Mutation<void, MercuryConnection> => useMut(() => actions.mercuryRefresh());

// ─── Профиль, уведомления, помощь ───────────────────────────────────────────

export const useNotifications = (): Query<AppNotification[]> =>
  useQ(
    () =>
      rows('notifications')
        .map(toNotification)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [],
  );

export const useMarkNotificationsRead = (): Mutation<{ ids?: Uuid[] }, void> =>
  useMut(({ ids }: { ids?: Uuid[] }) => actions.markNotificationsRead(ids));

export const useSettings = (): Query<UserSettings> => useQ(() => currentSettings(), []);
export const useUpdateSettings = (): Mutation<Partial<UserSettings>, UserSettings> =>
  useMut((patch: Partial<UserSettings>) => actions.updateSettings(patch));

export const useFaq = (): Query<FaqItem[]> => useQ(() => FAQ_ITEMS, []);

export const useCreateSupportTicket = (): Mutation<NewSupportTicket, SupportTicket> =>
  useMut((input: NewSupportTicket) => actions.createSupportTicket(input));

