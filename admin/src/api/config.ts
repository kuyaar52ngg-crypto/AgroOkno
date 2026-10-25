// Переменные окружения Vite (см. admin/.env.example).

export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  supabaseKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
  apiUrl: (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, ''),
  mock: import.meta.env.VITE_MOCK === '1',
};

/** Имена не заданных обязательных переменных (в режиме заглушек они не нужны). */
export function missingConfig(): string[] {
  if (config.mock) return [];
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!config.supabaseKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!config.apiUrl) missing.push('VITE_API_URL');
  return missing;
}
