// Адреса серверных функций: Node.js-сервер АгроОкно (server/, EXPO_PUBLIC_API_URL — например http://192.168.0.60:3001
// для телефона в LAN) либо Vercel-функции app/api/** (запасной вариант).
// Ссылки на XLSX/PDF строятся как <база>/api/...: оба сервера отдают одинаковые пути.
// Веб на Vercel: относительные пути /api/... (приложение и API на одном домене). Локальная веб-разработка и нативные
// сборки используют EXPO_PUBLIC_API_URL.
import { Platform } from 'react-native';

import { supabase } from './supabase';

export function apiBase(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (Platform.OS !== 'web') return configured;
  const host = (globalThis as { location?: { hostname?: string } }).location?.hostname ?? '';
  const local = host === 'localhost' || host === '127.0.0.1';
  return local ? configured : '';
}

/** Адрес Node-сервера из EXPO_PUBLIC_API_URL (без завершающего слэша) или пустая строка. */
export const serverBase = (): string => (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function apiUrl(path: string, params: Record<string, string | number | undefined | null> = {}): string {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${apiBase()}${path}${query ? `?${query}` : ''}`;
}

/** Ошибка вызова сервера: status === 0 — нет связи / сервер не отвечает. */
export class ApiCallError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Запрос к Node.js-серверу АгроОкно (EXPO_PUBLIC_API_URL, версия /v1) с токеном пользователя.
 * Бросает ApiCallError; JSON-ответ сервера имеет вид { error, code }.
 */
export async function serverFetch<T>(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData; timeoutMs?: number } = {},
): Promise<T> {
  // Node-сервер (/v1/...) — только по EXPO_PUBLIC_API_URL; на Vercel-вебе без этого адреса помощник недоступен.
  const base = serverBase();
  if (!base) throw new ApiCallError(0, 'Сервер помощника не настроен (EXPO_PUBLIC_API_URL)');
  const token = await accessToken();
  if (!token) throw new ApiCallError(401, 'Сессия истекла. Войдите заново', 'unauthorized');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 25_000);
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
      headers,
      body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      signal: controller.signal,
    });
  } catch {
    throw new ApiCallError(0, 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) throw new ApiCallError(res.status, body.error ?? 'Сервер вернул ошибку. Попробуйте позже', body.code);
  return body as T;
}
