// Очистка текста от персональных данных перед отправкой в Sentry: email, телефоны, ИНН (10/12 цифр).
// Чистые функции без зависимостей — покрыты юнит-тестом (monitoring-scrub.test.ts).

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[^\s@<>()"']+/g;
// Телефон: +7 999 123-45-67, 8(914)123-45-67 и т.п. (10–11 цифр с разделителями).
const PHONE = /(?<!\d)\+?\d(?:[\s().-]*\d){9,10}(?!\d)/g;
// Длинные цифровые последовательности: ИНН (10/12), ОГРН (13/15), СНИЛС и т.п. — от 9 цифр подряд.
const LONG_DIGITS = /(?<![\w-])\d{9,}(?![\w-])/g;

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]').replace(LONG_DIGITS, '[number]');
}

type Json = unknown;

/** Рекурсивно чистит строки в объекте события (копия, исходный объект не меняется). */
export function scrubDeep<T extends Json>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as unknown as T;
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value as Record<string, Json>)) out[k] = scrubDeep(v, depth + 1);
  return out as T;
}

/** Событие Sentry без PII: у пользователя остаётся только id, IP и заголовки удаляются, строки очищаются. */
export function scrubEvent<E extends { user?: { id?: string | number } & Record<string, unknown>; request?: unknown; server_name?: string }>(event: E): E {
  const cleaned = scrubDeep(event) as E;
  if (cleaned.user) cleaned.user = cleaned.user.id !== undefined ? { id: String(cleaned.user.id) } : undefined;
  delete (cleaned as { request?: unknown }).request;
  delete (cleaned as { server_name?: string }).server_name;
  return cleaned;
}
