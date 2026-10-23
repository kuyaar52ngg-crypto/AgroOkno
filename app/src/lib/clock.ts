// Время хозяйства: Якутск (UTC+9). Для демо дату можно зафиксировать переменной EXPO_PUBLIC_DEMO_DATE=YYYY-MM-DD.
const YAKUTSK_OFFSET_MS = 9 * 3600_000;

export function nowIso(): string {
  return new Date().toISOString();
}

/** Сегодня в часовом поясе хозяйства, YYYY-MM-DD. */
export function todayIso(): string {
  const demo = process.env.EXPO_PUBLIC_DEMO_DATE;
  if (demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)) return demo;
  return new Date(Date.now() + YAKUTSK_OFFSET_MS).toISOString().slice(0, 10);
}
