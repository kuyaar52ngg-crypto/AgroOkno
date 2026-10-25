// Мониторинг ошибок (Sentry) — необязательный. Включается только если при сборке задан VITE_SENTRY_DSN.
// Без DSN условие вычисляется на этапе сборки, @sentry/react не попадает ни в бандл, ни в запросы браузера.
// Персональные данные не отправляются: SDK по умолчанию не собирает PII, события чистятся (scrub), у пользователя только id.
import { scrubDeep, scrubEvent } from './scrub';

type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;

/** Загружает и инициализирует Sentry (асинхронно, отдельным чанком). Без DSN ничего не делает. */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  void import('@sentry/react')
    .then((mod) => {
      mod.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
        beforeSend: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => (crumb.category?.startsWith('ui.') ? null : scrubDeep(crumb)),
      });
      sentry = mod;
    })
    .catch(() => {
      // мониторинг не должен ломать панель
    });
}

/** Идентификатор администратора (uuid) — без email. null при выходе. */
export function setMonitoringUser(id: string | null): void {
  sentry?.setUser(id ? { id } : null);
}
