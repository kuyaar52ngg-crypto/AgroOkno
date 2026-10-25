// Мониторинг ошибок сервера (Sentry) — необязательный: включается только если задан SENTRY_DSN.
// Без DSN ничего не инициализируется и сетевых вызовов нет. Персональные данные не отправляются:
// SDK по умолчанию не собирает PII (IP, cookies, пользовательские данные), тела и заголовки запросов не передаются, строки очищаются от email/телефонов/ИНН.
import * as Sentry from '@sentry/node';

import { scrubEvent } from '../../app/src/lib/monitoring-scrub';

export interface ErrorContext {
  method?: string;
  /** Шаблон маршрута (например /v1/farms/:id), без параметров и query. */
  route?: string;
  status?: number;
  userId?: string;
}

export type ErrorReporter = (error: unknown, context: ErrorContext) => void;

let reporter: ErrorReporter | null = null;

/** Подменяет получателя ошибок (используется тестами). */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

/** Инициализирует Sentry, если задан DSN. Возвращает true, когда мониторинг включён. */
export function initMonitoring(options: { dsn?: string; environment?: string; release?: string }): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment ?? process.env.NODE_ENV ?? 'production',
    release: options.release,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => (crumb.category === 'http' || crumb.category === 'console' ? null : crumb),
  });
  setErrorReporter((error, context) => {
    Sentry.withScope((scope) => {
      scope.setTag('method', context.method ?? 'unknown');
      if (context.route) scope.setTag('route', context.route);
      if (context.status) scope.setTag('status', String(context.status));
      if (context.userId) scope.setUser({ id: context.userId });
      Sentry.captureException(error instanceof Error ? error : new Error(String((error as { message?: string })?.message ?? error)));
    });
  });
  return true;
}

/** Отправляет ошибку 5xx в Sentry (если включён). Никогда не бросает исключений. */
export function captureServerError(error: unknown, context: ErrorContext): void {
  try {
    reporter?.(error, context);
  } catch {
    // мониторинг не должен ломать обработку запроса
  }
}

/** Дожидается отправки накопленных событий перед остановкой процесса. */
export async function flushMonitoring(timeoutMs = 2000): Promise<void> {
  if (!reporter) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // игнорируем
  }
}
