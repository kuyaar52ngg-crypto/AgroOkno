// Загрузка данных: ключ запроса + функция. Пока идёт повторная загрузка, прежние данные остаются на экране.
import { useCallback, useEffect, useEffectEvent, useState } from 'react';

import { toApiError } from '../api/errors';
import type { ApiError } from '../api/errors';

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | null;
  /** Идёт запрос (данные могут быть прежними). */
  loading: boolean;
  /** Запрос идёт дольше обычного — сервер на Render, скорее всего, просыпается. */
  slow: boolean;
  reload: () => void;
}

interface Result<T> {
  id: string;
  data?: T;
  error?: ApiError;
}

const SLOW_AFTER_MS = 4000;

/**
 * `key` — всё, от чего зависит запрос (фильтры, страница, id): при смене ключа запрос выполняется заново.
 * `fn` может замыкать любые значения — она всегда вызывается в актуальной версии.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>, slowAfterMs: number = SLOW_AFTER_MS): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const [slowId, setSlowId] = useState<string | null>(null);
  const id = `${key}#${nonce}`;
  const run = useEffectEvent(fn);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setSlowId(id);
    }, slowAfterMs);
    run().then(
      (data) => {
        if (!cancelled) setResult({ id, data });
      },
      (e: unknown) => {
        if (!cancelled) setResult({ id, error: toApiError(e) });
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, slowAfterMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result?.id !== id;
  return {
    data: result?.data,
    error: loading ? null : (result?.error ?? null),
    loading,
    slow: loading && slowId === id,
    reload,
  };
}
