// Выбор модели помощника: чистые функции над черновиком (как в мобильном экране «Модель помощника»).
import type { AssistantModelOption } from '../api/types';

export const MAX_FALLBACKS = 3;

export interface ModelDraft {
  model: string;
  fallbacks: string[];
}

export function selectPrimary(draft: ModelDraft, id: string): ModelDraft {
  if (draft.model === id) return draft;
  return { model: id, fallbacks: draft.fallbacks.filter((f) => f !== id) };
}

/** Добавляет в запасные или убирает; основную модель и сверх лимита — не трогает. */
export function toggleFallback(draft: ModelDraft, id: string): ModelDraft {
  if (draft.model === id) return draft;
  if (draft.fallbacks.includes(id)) return { ...draft, fallbacks: draft.fallbacks.filter((f) => f !== id) };
  if (draft.fallbacks.length >= MAX_FALLBACKS) return draft;
  return { ...draft, fallbacks: [...draft.fallbacks, id] };
}

export function moveFallback(draft: ModelDraft, index: number, delta: -1 | 1): ModelDraft {
  const target = index + delta;
  if (index < 0 || index >= draft.fallbacks.length || target < 0 || target >= draft.fallbacks.length) return draft;
  const next = [...draft.fallbacks];
  const a = next[index] as string;
  next[index] = next[target] as string;
  next[target] = a;
  return { ...draft, fallbacks: next };
}

export function isDirty(draft: ModelDraft, stored: { model: string; fallback_models: string[] }): boolean {
  return draft.model !== stored.model || draft.fallbacks.join('|') !== stored.fallback_models.join('|');
}

export function filterModels(list: readonly AssistantModelOption[], query: string, onlyFree: boolean): AssistantModelOption[] {
  const q = query.trim().toLowerCase();
  return list.filter((o) => (!onlyFree || o.free) && (q === '' || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)));
}
