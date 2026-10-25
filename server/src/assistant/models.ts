// Модель помощника: глобальная настройка из БД (RPC get_assistant_model_settings, кеш 30 с; при ошибке — env OPENROUTER_MODEL)
// и каталог моделей OpenRouter с поддержкой tool calling для админ-панели (кеш 10 минут).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { AssistantModelOption, AssistantModelSettings } from '../../../app/src/data/contract';
import { OPENROUTER_BASE_URL } from './openrouter';
import type { ModelChoice } from './types';

export const SETTINGS_TTL_MS = 30_000;
export const CATALOG_TTL_MS = 10 * 60_000;
/** Ошибка чтения настройки не кешируется надолго: БД может вернуться через секунды. */
const FAILURE_TTL_MS = 10_000;

const settingsRow = z.object({
  model: z.string().trim().min(1),
  fallback_models: z.array(z.string().trim().min(1)).default([]),
  updated_at: z.string().nullable().default(null),
  updated_by: z.string().nullable().default(null),
});

/** Приводит ответ RPC (jsonb) к AssistantModelSettings; null — формат неожиданный. */
export function parseSettings(data: unknown): AssistantModelSettings | null {
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = settingsRow.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export interface ModelSettingsStore {
  /** Текущий выбор модели. Не бросает: при недоступности БД возвращает значение из env. client — клиент Supabase для RPC. */
  get(client?: SupabaseClient | null): Promise<ModelChoice & { source: 'db' | 'env' }>;
  /** Последнее известное значение без обращения к БД (до первого чтения — env). */
  peek(): ModelChoice & { source: 'db' | 'env' };
  /** Запоминает значение после сохранения администратором; без аргумента — помечает кеш устаревшим (значение остаётся для peek). */
  set(settings?: Pick<AssistantModelSettings, 'model' | 'fallback_models'>): void;
}

export function createModelSettingsStore(options: { defaultModel: string; clock?: () => number }): ModelSettingsStore {
  const now = options.clock ?? Date.now;
  const envChoice = (): ModelChoice & { source: 'env' } => ({ model: options.defaultModel, fallbacks: [], source: 'env' });
  let cache: { value: ModelChoice & { source: 'db' | 'env' }; until: number } | null = null;
  let inflight: Promise<ModelChoice & { source: 'db' | 'env' }> | null = null;

  return {
    peek: () => cache?.value ?? envChoice(),
    set(settings) {
      if (settings) cache = { value: { model: settings.model, fallbacks: settings.fallback_models, source: 'db' }, until: now() + SETTINGS_TTL_MS };
      else if (cache) cache = { value: cache.value, until: 0 };
    },
    async get(client) {
      if (cache && cache.until > now()) return cache.value;
      if (!client) return cache?.value ?? envChoice();
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const { data, error } = await client.rpc('get_assistant_model_settings');
          const settings = error ? null : parseSettings(data);
          if (!settings) throw new Error(error?.message ?? 'пустой ответ');
          const value = { model: settings.model, fallbacks: settings.fallback_models, source: 'db' as const };
          cache = { value, until: now() + SETTINGS_TTL_MS };
          return value;
        } catch {
          // БД недоступна или миграция не применена: работаем на env, повторная попытка через 10 с.
          const value = cache?.value ?? envChoice();
          cache = { value, until: now() + FAILURE_TTL_MS };
          return value;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}

// ─── Каталог моделей OpenRouter ─────────────────────────────────────────────

interface OpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string | number; completion?: string | number };
  supported_parameters?: string[];
}

const isZero = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && Number(v) === 0;

/** Только модели с tool calling; free — id оканчивается на :free или цена prompt и completion равна нулю. */
export function toModelOptions(models: OpenRouterModel[]): AssistantModelOption[] {
  const options: AssistantModelOption[] = [];
  for (const m of models) {
    if (!m.id || !m.supported_parameters?.includes('tools')) continue;
    options.push({
      id: m.id,
      name: m.name?.trim() || m.id,
      free: m.id.endsWith(':free') || (isZero(m.pricing?.prompt) && isZero(m.pricing?.completion)),
      context_length: typeof m.context_length === 'number' ? m.context_length : null,
    });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export interface ModelCatalog {
  /** Бросает ошибку, если список недоступен и в кеше ничего нет; при сбое отдаёт устаревший кеш. */
  list(): Promise<AssistantModelOption[]>;
}

export function createModelCatalog(options: { baseUrl?: string; fetchImpl?: typeof fetch; clock?: () => number; timeoutMs?: number } = {}): ModelCatalog {
  const now = options.clock ?? Date.now;
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${(options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, '')}/models`;
  let cache: { value: AssistantModelOption[]; until: number } | null = null;
  let inflight: Promise<AssistantModelOption[]> | null = null;

  return {
    async list() {
      if (cache && cache.until > now()) return cache.value;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          // Список моделей публичный, ключ не нужен.
          const res = await doFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
          if (!res.ok) throw new Error(`OpenRouter /models ${res.status}`);
          const body = (await res.json()) as { data?: OpenRouterModel[] };
          if (!Array.isArray(body.data)) throw new Error('OpenRouter /models: неожиданный формат ответа');
          const value = toModelOptions(body.data);
          cache = { value, until: now() + CATALOG_TTL_MS };
          return value;
        } catch (e) {
          if (cache) {
            cache = { value: cache.value, until: now() + 30_000 }; // отдаём устаревший список и не долбим OpenRouter
            return cache.value;
          }
          throw e;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}
