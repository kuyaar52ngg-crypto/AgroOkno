// Очистка текста от персональных данных перед отправкой в Sentry: email, телефоны, ИНН (длинные числа).
// Копия app/src/lib/monitoring-scrub.ts (панель деплоится отдельным проектом и не импортирует код приложения).

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[^\s@<>()"']+/g;
const PHONE = /(?<!\d)\+?\d(?:[\s().-]*\d){9,10}(?!\d)/g;
const LONG_DIGITS = /(?<![\w-])\d{9,}(?![\w-])/g;

export function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]').replace(LONG_DIGITS, '[number]');
}

export function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as unknown as T;
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v, depth + 1);
  return out as T;
}

/** Событие без PII: у пользователя остаётся только id, запрос (URL, заголовки, cookies) удаляется. */
export function scrubEvent<E extends { user?: { id?: string | number } & Record<string, unknown>; request?: unknown }>(event: E): E {
  const cleaned = scrubDeep(event) as E;
  if (cleaned.user) cleaned.user = cleaned.user.id !== undefined ? { id: String(cleaned.user.id) } : undefined;
  delete (cleaned as { request?: unknown }).request;
  return cleaned;
}
