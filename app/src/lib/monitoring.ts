// Мониторинг ошибок (Sentry) — необязательный и по умолчанию выключен.
// Включается только если при сборке задан EXPO_PUBLIC_SENTRY_DSN. Без него модуль — пустая заглушка:
// @sentry/react-native не попадает в бандл (Metro подставляет значение переменной и вырезает ветку), сетевых вызовов нет.
// Персональные данные не отправляются: sendDefaultPii выключен, события чистятся (monitoring-scrub), у пользователя только id.
import type { ComponentType } from 'react';

import { scrubDeep, scrubEvent } from './monitoring-scrub';

type SentryModule = typeof import('@sentry/react-native');

let sentry: SentryModule | null = null;

function load(): SentryModule | null {
  // Тернарный оператор с прямым process.env.EXPO_PUBLIC_*: Metro подставляет значение и вырезает ветку с require,
  // так что без DSN @sentry/react-native не попадает в бандл. (Ранний return этого не даёт.)
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ленивый синхронный require: без DSN Metro вырезает ветку
  return process.env.EXPO_PUBLIC_SENTRY_DSN ? (require('@sentry/react-native') as SentryModule) : null;
}

/** Инициализация Sentry. Вызывать один раз при старте приложения (корневой layout). */
export function initMonitoring(): void {
  if (sentry) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const mod = load();
  if (!mod || !dsn) return;
  sentry = mod;
  try {
    mod.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      sendDefaultPii: false,
      // Только ошибки: без трассировок, профилей, записи сессий и скриншотов.
      tracesSampleRate: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableUserInteractionTracing: false,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => {
        // Тапы и ввод могут содержать подписи с данными — оставляем только навигацию, сеть и консоль без данных.
        if (crumb.category === 'ui.click' || crumb.category === 'touch') return null;
        return scrubDeep(crumb);
      },
    });
  } catch {
    sentry = null;
  }
}

/** Оборачивает корневой компонент (Sentry.wrap) только когда мониторинг включён. */
export function wrapRoot<P extends object>(Root: ComponentType<P>): ComponentType<P> {
  const mod = load();
  return mod ? (mod.wrap(Root as ComponentType<Record<string, unknown>>) as unknown as ComponentType<P>) : Root;
}

/** Идентификатор пользователя (uuid) — без email, телефона и ИНН. null при выходе. */
export function setMonitoringUser(id: string | null): void {
  sentry?.setUser(id ? { id } : null);
}

/** Отправляет пойманную ошибку (например, сбой синхронизации). Без DSN — ничего не делает. */
export function captureError(error: unknown, area: string): void {
  if (!sentry) return;
  try {
    sentry.captureException(error instanceof Error ? error : new Error(String((error as { message?: string })?.message ?? error)), {
      tags: { area },
    });
  } catch {
    // мониторинг не должен ломать приложение
  }
}
