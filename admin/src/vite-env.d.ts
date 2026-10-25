/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_API_URL?: string;
  /** 1 — демо-данные вместо реального API (npm run dev:mock). */
  readonly VITE_MOCK?: string;
  /** Необязательно: DSN проекта Sentry (@sentry/react). Без него мониторинг ошибок выключен. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
