// Единая шина изменений слоя данных: хуки подписываются через useSyncExternalStore и
// пересчитываются при любом изменении локальной БД, статуса синхронизации или сессии.
const listeners = new Set<() => void>();
let version = 0;

export function emitChange(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVersion = (): number => version;
