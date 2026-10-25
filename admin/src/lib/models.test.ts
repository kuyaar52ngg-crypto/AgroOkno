import { describe, expect, it } from 'vitest';

import type { AssistantModelOption } from '../api/types';
import { filterModels, isDirty, MAX_FALLBACKS, moveFallback, selectPrimary, toggleFallback } from './models';

const base = { model: 'a', fallbacks: ['b', 'c'] };

describe('выбор модели помощника', () => {
  it('selectPrimary убирает выбранную модель из запасных', () => {
    expect(selectPrimary(base, 'c')).toEqual({ model: 'c', fallbacks: ['b'] });
    expect(selectPrimary(base, 'z')).toEqual({ model: 'z', fallbacks: ['b', 'c'] });
    expect(selectPrimary(base, 'a')).toBe(base);
  });

  it('toggleFallback добавляет, убирает и держит лимит', () => {
    expect(toggleFallback(base, 'd')).toEqual({ model: 'a', fallbacks: ['b', 'c', 'd'] });
    expect(toggleFallback(base, 'b')).toEqual({ model: 'a', fallbacks: ['c'] });
    expect(toggleFallback(base, 'a')).toBe(base);
    const full = { model: 'a', fallbacks: ['b', 'c', 'd'] };
    expect(full.fallbacks.length).toBe(MAX_FALLBACKS);
    expect(toggleFallback(full, 'e')).toBe(full);
  });

  it('moveFallback меняет порядок и не выходит за границы', () => {
    expect(moveFallback(base, 0, 1)).toEqual({ model: 'a', fallbacks: ['c', 'b'] });
    expect(moveFallback(base, 1, -1)).toEqual({ model: 'a', fallbacks: ['c', 'b'] });
    expect(moveFallback(base, 0, -1)).toBe(base);
    expect(moveFallback(base, 1, 1)).toBe(base);
    expect(moveFallback(base, 5, 1)).toBe(base);
  });

  it('isDirty учитывает порядок запасных', () => {
    const stored = { model: 'a', fallback_models: ['b', 'c'] };
    expect(isDirty(base, stored)).toBe(false);
    expect(isDirty({ model: 'a', fallbacks: ['c', 'b'] }, stored)).toBe(true);
    expect(isDirty({ model: 'x', fallbacks: ['b', 'c'] }, stored)).toBe(true);
  });

  it('filterModels: поиск по названию и id, только бесплатные', () => {
    const list: AssistantModelOption[] = [
      { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', free: false, context_length: 200000 },
      { id: 'google/gemini-3-flash:free', name: 'Google: Gemini 3 Flash (free)', free: true, context_length: null },
    ];
    expect(filterModels(list, '', false)).toHaveLength(2);
    expect(filterModels(list, 'GEMINI', false).map((m) => m.id)).toEqual(['google/gemini-3-flash:free']);
    expect(filterModels(list, 'anthropic/', false)).toHaveLength(1);
    expect(filterModels(list, '', true).map((m) => m.free)).toEqual([true]);
    expect(filterModels(list, 'claude', true)).toHaveLength(0);
  });
});
