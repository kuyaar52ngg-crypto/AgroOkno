// Состояние страницы в query-параметрах адреса: фильтры, поиск, страница, сортировка.
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import { patchParams } from '../lib/query';
import type { ParamPatch } from '../lib/query';

export interface UpdateOptions {
  /** Сбрасывать страницу на первую (по умолчанию — да, кроме смены самой страницы). */
  resetPage?: boolean;
  /** Не добавлять запись в историю браузера (по умолчанию — да). */
  replace?: boolean;
}

export function useUrlParams(): readonly [URLSearchParams, (patch: ParamPatch, options?: UpdateOptions) => void] {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch: ParamPatch, options: UpdateOptions = {}) => {
      const { resetPage = true, replace = true } = options;
      setParams((prev) => patchParams(prev, resetPage ? { page: null, ...patch } : patch), { replace });
    },
    [setParams],
  );
  return [params, update] as const;
}
