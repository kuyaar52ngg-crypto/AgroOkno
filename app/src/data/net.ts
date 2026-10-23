// Состояние связи и синхронизации (для useSyncStatus и признака fromCache).
// Связь определяется по результату реальных запросов к Supabase (и событиям браузера на вебе),
// поэтому дополнительные нативные модули не нужны.
import { emitChange } from './bus';
import { getMeta, setMeta } from './store';

interface NetState {
  online: boolean;
  syncing: boolean;
  lastError: string | null;
  /** Хотя бы одна синхронизация с сервером за время жизни кеша. */
  everSynced: boolean;
}

export const net: NetState = { online: true, syncing: false, lastError: null, everSynced: false };

export function setOnline(online: boolean): void {
  if (net.online === online) return;
  net.online = online;
  emitChange();
}

export function setSyncing(syncing: boolean): void {
  if (net.syncing === syncing) return;
  net.syncing = syncing;
  emitChange();
}

export function setLastError(message: string | null): void {
  net.lastError = message;
  emitChange();
}

export const lastSyncedAt = (): string | null => getMeta('last_synced_at') ?? null;

export function markSynced(at: string): void {
  net.everSynced = true;
  setMeta('last_synced_at', at);
  emitChange();
}

/** Ошибка сети (нет связи), а не отказ сервера. */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : typeof e === 'string' ? e : JSON.stringify(e ?? '');
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed|timeout|timed out|ECONN|ENOTFOUND|ETIMEDOUT|AuthRetryableFetchError|offline/i.test(msg);
}
