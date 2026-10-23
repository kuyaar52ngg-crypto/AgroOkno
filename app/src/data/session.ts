// Сессия и жизненный цикл слоя данных: инициализация локальной БД, восстановление сессии Supabase,
// привязка локального кеша к пользователю, запуск и остановка синхронизации.
import { AppState, Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { emitChange } from './bus';
import { lastSyncedAt, net, setOnline } from './net';
import { onPulled, requestSync, retrySync, setSyncUser, syncNow } from './sync';
import { getDoc, getMeta, initStore, rows, setMeta, wipeStore, flush, type Row } from './store';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export const session: { status: AuthStatus; userId: string | null } = { status: 'loading', userId: null };

let initPromise: Promise<void> | null = null;
let activation: { userId: string; promise: Promise<void> } | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 30_000;
const FIRST_PULL_TIMEOUT_MS = 15_000;

const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const currentUserId = (): string | null => session.userId;

/**
 * Хозяйство текущего пользователя: своё (владелец) либо хозяйство, к которому одобрен доступ.
 * Специалист сельсовета видит и чужие ЛПХ поселения (только чтение) — их за «своё» не считаем.
 */
export function currentFarmRow(): Row | undefined {
  const farms = rows('farms');
  const own = farms.find((f) => f.owner_id === session.userId);
  if (own) return own;
  const role = session.userId ? getDoc('profiles', session.userId)?.data.role : undefined;
  return role === 'council_specialist' ? undefined : farms[0];
}

export const currentFarmId = (): string | null => (currentFarmRow()?.id as string | undefined) ?? null;

export function activateUser(userId: string): Promise<void> {
  if (activation?.userId === userId) return activation.promise;
  const promise = (async () => {
    const stored = getMeta('user_id');
    if (stored && stored !== userId) await wipeStore();
    setMeta('user_id', userId);
    session.userId = userId;
    setSyncUser(userId);
    const hasCache = rows('farms').length > 0;
    if (hasCache) {
      session.status = 'signed_in';
      emitChange();
      void syncNow({ force: true });
    } else {
      await Promise.race([syncNow({ force: true }), timeout(FIRST_PULL_TIMEOUT_MS)]);
      session.status = 'signed_in';
      emitChange();
    }
    startBackground();
  })();
  activation = { userId, promise };
  return promise;
}

export function deactivateUser(): void {
  activation = null;
  session.userId = null;
  session.status = 'signed_out';
  setSyncUser(null);
  stopBackground();
  emitChange();
}

function startBackground(): void {
  if (intervalId) return;
  intervalId = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
}

function stopBackground(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

/** Однократная инициализация (DataProvider). */
export function initData(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initStore();
    if (lastSyncedAt()) net.everSynced = true;

    supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') deactivateUser();
      else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && s?.user) void activateUser(s.user.id);
    });

    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await activateUser(data.session.user.id);
    else {
      session.status = 'signed_out';
      emitChange();
    }

    // Возврат приложения на экран и восстановление сети — повод синхронизироваться сразу.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
      else void flush();
    });
    if (Platform.OS === 'web') {
      const w = globalThis as unknown as { addEventListener?: (n: string, f: () => void) => void; navigator?: { onLine?: boolean } };
      w.addEventListener?.('online', () => void retrySync());
      w.addEventListener?.('offline', () => setOnline(false));
      if (w.navigator?.onLine === false) setOnline(false);
    }
  })();
  return initPromise;
}

export { net, onPulled, requestSync, retrySync, syncNow };
