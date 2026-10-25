// v3-члены DataModule: ВетИС «Хорриот» (учебная передача и сверка с книгой) и админ-панель модели помощника (OpenRouter).
// Хорриот работает офлайн поверх локальной БД, как «Меркурий». Админ-панель ходит на Node-сервер (EXPO_PUBLIC_API_URL, /v1/admin/*)
// с токеном пользователя; офлайн или при ошибке useIsAdmin → false, остальные запросы отдают понятную ошибку.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { ApiCallError, serverFetch } from '../lib/api';
import { todayIso } from '../lib/clock';
import { pendingHorriotSources, reconcileHorriot, type HorriotSource } from '../reports/horriot';
import * as actions from './actions';
import type {
  AssistantModelOption,
  AssistantModelSettings,
  HorriotConnection,
  HorriotState,
  Mutation,
  Query,
} from './contract';
import { currentFarmData, toHorriotConnection, toHorriotRecord } from './entities';
import { net } from './net';
import { currentFarmRow, session } from './session';
import { getDoc, rows } from './store';
import { useMut, useQ, useVersion } from './hooks';

// ─── Хорриот ────────────────────────────────────────────────────────────────

export function computeHorriot(today: string): HorriotState | undefined {
  const farm = currentFarmRow();
  const data = currentFarmData();
  if (!farm || !data) return undefined;
  const connection = toHorriotConnection(getDoc('horriot_connections', String(farm.id))?.data);
  const records = rows('horriot_records')
    .map(toHorriotRecord)
    .sort((a, b) => (a.registered_on === b.registered_on ? b.number.localeCompare(a.number) : b.registered_on.localeCompare(a.registered_on)));
  const sources: HorriotSource[] = data.movements.map((m) => ({
    id: m.id ?? '',
    occurred_on: m.occurred_on,
    animal_group: m.animal_group,
    kind: m.kind,
    heads: m.heads,
  }));
  const registered = new Set(records.map((r) => r.source_movement_id).filter((id): id is string => !!id));
  return {
    connection,
    records,
    reconciliation: reconcileHorriot(data.movements, records, today),
    pending_count: pendingHorriotSources(sources, registered).length,
  };
}

export const useHorriot = (): Query<HorriotState> => useQ(() => computeHorriot(todayIso()), []);
export const useHorriotConnect = (): Mutation<void, HorriotConnection> => useMut(() => actions.horriotConnect());
export const useHorriotRefresh = (): Mutation<void, HorriotConnection> => useMut(() => actions.horriotRefresh());

// ─── Запросы к серверу (кеш на время жизни приложения, общий для экранов) ────

interface RemoteEntry {
  data?: unknown;
  error: string | null;
  loading: boolean;
  at: number;
  promise?: Promise<void>;
}

const remote = new Map<string, RemoteEntry>();
const remoteListeners = new Set<() => void>();
let remoteVersion = 0;

function setRemote(key: string, entry: RemoteEntry): void {
  remote.set(key, entry);
  remoteVersion += 1;
  remoteListeners.forEach((l) => l());
}

const subscribeRemote = (listener: () => void) => {
  remoteListeners.add(listener);
  return () => {
    remoteListeners.delete(listener);
  };
};
const getRemoteVersion = () => remoteVersion;

const errorText = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Не удалось получить данные. Попробуйте ещё раз');

/** Загружает данные в кеш; повторный вызов во время загрузки возвращает тот же promise. */
function fetchRemote<T>(key: string, load: () => Promise<T>, options: { ttlMs: number; force?: boolean }): Promise<void> {
  const cur = remote.get(key);
  if (cur?.promise) return cur.promise;
  if (!options.force && cur?.data !== undefined && !cur.error && Date.now() - cur.at < options.ttlMs) return Promise.resolve();
  const promise = load().then(
    (data) => setRemote(key, { data, error: null, loading: false, at: Date.now() }),
    (e: unknown) => setRemote(key, { data: remote.get(key)?.data, error: errorText(e), loading: false, at: remote.get(key)?.at ?? 0 }),
  );
  setRemote(key, { ...cur, error: null, loading: true, at: cur?.at ?? 0, promise });
  return promise;
}

function useRemote<T>(name: string, load: () => Promise<T>, options: { ttlMs: number; fallback?: T }): Query<T> {
  useSyncExternalStore(subscribeRemote, getRemoteVersion, getRemoteVersion);
  useVersion(); // смена пользователя/сессии
  const signedIn = session.status === 'signed_in' && session.userId !== null;
  const key = `${session.userId ?? '-'}:${name}`;
  const online = net.online;
  const entry = remote.get(key);

  useEffect(() => {
    if (!signedIn || !online) return;
    void fetchRemote(key, load, { ttlMs: options.ttlMs });
    // load и ttlMs постоянны для имени запроса
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signedIn, online]);

  const refetch = useCallback(async () => {
    if (!signedIn || !net.online) return;
    await fetchRemote(key, load, { ttlMs: options.ttlMs, force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signedIn]);

  return useMemo((): Query<T> => {
    const data = (entry?.data as T | undefined) ?? options.fallback;
    const hasData = entry?.data !== undefined;
    const loading = signedIn && online && !hasData && !entry?.error && (entry?.loading ?? true);
    const error = !signedIn || hasData || options.fallback !== undefined ? null : !online ? 'Нет подключения к сети. Настройки модели доступны только онлайн' : (entry?.error ?? null);
    return { data, loading, fromCache: signedIn && !online && hasData, error, refetch };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, signedIn, online, key, refetch]);
}

// ─── Админ-панель: модель помощника ─────────────────────────────────────────

const SETTINGS_KEY = 'assistant-settings';

/** true, если email пользователя есть в app_admins. Нет сети, сервер недоступен или не админ — false. */
export const useIsAdmin = (): Query<boolean> =>
  useRemote<boolean>(
    'is-admin',
    async () => {
      try {
        const res = await serverFetch<{ is_admin: boolean }>('/v1/admin/me', { timeoutMs: 8_000 });
        return res.is_admin === true;
      } catch {
        return false;
      }
    },
    { ttlMs: 60_000, fallback: false },
  );

export const useAssistantModelSettings = (): Query<AssistantModelSettings> =>
  useRemote<AssistantModelSettings>(SETTINGS_KEY, () => serverFetch<AssistantModelSettings>('/v1/admin/assistant-settings', { timeoutMs: 15_000 }), { ttlMs: 0 });

/** Модели OpenRouter с поддержкой tool calling (сервер кеширует список на 10 минут). */
export const useAssistantModelOptions = (): Query<AssistantModelOption[]> =>
  useRemote<AssistantModelOption[]>(
    'assistant-models',
    async () => (await serverFetch<{ models: AssistantModelOption[] }>('/v1/admin/models', { timeoutMs: 30_000 })).models,
    { ttlMs: 10 * 60_000 },
  );

export const useUpdateAssistantModelSettings = (): Mutation<Pick<AssistantModelSettings, 'model' | 'fallback_models'>, AssistantModelSettings> =>
  useMut(async (input: Pick<AssistantModelSettings, 'model' | 'fallback_models'>) => {
    const model = input.model.trim();
    if (!model) throw new Error('Выберите основную модель');
    const fallbacks = input.fallback_models.map((m) => m.trim()).filter(Boolean);
    if (fallbacks.length > 3) throw new Error('Запасных моделей — не больше трёх');
    if (new Set([model, ...fallbacks]).size !== fallbacks.length + 1) throw new Error('Модели не должны повторяться');
    try {
      const saved = await serverFetch<AssistantModelSettings>('/v1/admin/assistant-settings', {
        method: 'PUT',
        json: { model, fallback_models: fallbacks },
        timeoutMs: 20_000,
      });
      setRemote(`${session.userId ?? '-'}:${SETTINGS_KEY}`, { data: saved, error: null, loading: false, at: Date.now() });
      return saved;
    } catch (e) {
      if (e instanceof ApiCallError && e.status === 0) throw new Error('Нет связи с сервером. Изменение модели доступно только онлайн');
      throw e;
    }
  });
