# Агент C — Node.js backend, БД и слой данных (v2)

Ты — senior backend-разработчик проекта «АгроОкно». Параллельно агент D делает UI новых экранов; стыкуетесь через `app/src/data/contract.ts`.

## Сначала прочитай
1. `C:\AgroOkno\docs\TZ-v2.md` — задача v2 (решения, API, зоны, DoD).
2. `C:\AgroOkno\docs\TZ-agents.md` — общее ТЗ v1 (стек, правила).
3. `C:\AgroOkno\app\src\data\contract.ts` — раздел «v2» и `DataModule`.
4. Текущая реализация слоя данных: `app/src/data/impl.ts`, `hooks.ts`, `actions.ts`, `store.ts`, `sync.ts`, `session.ts`, `auth.ts`; отчёты `app/src/reports/` (`engine.ts`, `deadlines.ts`, `routing.ts`); API `app/api/**` (`_lib/`); миграции `supabase/migrations/`, Edge Function `supabase/functions/recovery`.
5. Скриншоты: `C:/AgroOkno/docs/figma/s03-registration.png`, `s11-chat.png`, `home-v2.png`, `f3-notifications-v2.png`.
6. Для работы с Claude API **обязательно** загрузи скилл `claude-api` (Skill) до написания кода — актуальные модели, SDK, tool use / structured outputs.

Зона: `server/**`, `supabase/**`, `app/src/data/**` (кроме `contract.ts`, `mock.ts`), `app/src/lib/**`, `app/src/reports/**`, `app/api/**`, `app/templates/**`, `app/.env.example`, `app/.env.local`.

## Задачи

### 0. Сразу (≤ 15 минут)
В `app/src/data/impl` добавь заглушки всех новых членов `DataModule` (v2), чтобы `npx tsc --noEmit` снова проходил — агент D компилирует против `impl`. Затем реализуй по-настоящему.

### 1. Node.js-сервер `C:\AgroOkno\server`
- Fastify + TypeScript (ESM), zod-валидация, `@fastify/cors`, `@fastify/multipart`, `@fastify/swagger` + UI на `/docs`, pino-логи, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `node-cron`, `expo-server-sdk`. Свой `package.json` (npm), не смешивать с `app/package.json`.
- Скрипты: `dev` (tsx watch, порт из `PORT`, по умолчанию 3001, слушать `0.0.0.0` — телефон в LAN), `build` (бандл, например tsup/esbuild — общий код из `../app/src/reports` и `../app/api/_lib` должен попасть в сборку), `start`, `typecheck`, `test` (node:test или vitest).
- `src/env.ts` — схема env (zod) с понятными ошибками; `.env.example`: `PORT`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (только для cron), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `STT_PROVIDER=mock|yandex|openai`, `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`, `OPENAI_API_KEY`, `CRON_SECRET`, `CORS_ORIGINS`, `TZ_REGION=Asia/Yakutsk`. Реальные секреты в репозиторий не писать; `server/.env` — в `.gitignore`.
- Аутентификация: Bearer access_token Supabase → клиент Supabase от имени пользователя (RLS). Проверять токен (`auth.getUser`).
- Маршруты — по таблице TZ-v2 §4. Адаптер для существующих обработчиков `app/api/**` (они Web-стандартные `GET/POST(request): Response`) — переиспользовать, а не копировать.
- `Dockerfile` (multi-stage, node 22-alpine) + `server/README.md` (локальный запуск, env, деплой на Render/Railway — без реального деплоя).

### 2. Помощник
- `POST /v1/assistant/messages`: контекст — профиль/хозяйство, поголовье по группам, ближайшие сроки (`DeadlineReminder` из `app/src/reports`), последние N сообщений. Claude с инструментами: `propose_events` (массив строго по `NewEvent`; валидация zod; литры молока → кг как в v1: 1 л = 1,03 кг), `ask_clarification` (J5), `report_status`/`how_to` (карточки J6). Ответ: `{ reply: ChatMessage, proposed_events, needs_clarification }`.
- Без `ANTHROPIC_API_KEY` — правиловый парсер (надой, приплод, падёж, забой, продажа, «какие отчеты скоро сдавать») с теми же ответами по формату. Покрыть тестами (минимум фразы из макета J1–J6).
- Помощник **никогда** не отправляет отчёты и не меняет данные на сервере (только предлагает события). Текст — на русском, коротко, как в макете.
- `POST /v1/assistant/transcribe`: multipart, лимиты (≤ 60 с, ≤ 5 МБ, аудио-MIME), провайдеры `yandex` (SpeechKit, ru-RU), `openai` (Whisper), `mock` (возвращает 503 с понятным текстом «Распознавание речи не настроено — напишите текстом»). Интерфейс провайдера + тест на mock.
- История чата: таблица `chat_messages` (RLS по членству), хранение 90 дней.

### 3. БД (новая миграция, применить через Supabase MCP в проект `agrookno`, ref `mhsbdzthldggdaxsfgig`)
- `farm_members` (farm_id, user_id, role owner|member, created_at) + перенос существующих владельцев; `farm_join_requests`; `farms.invite_code` (уникальный, демо ЛПХ = `AGRO-0142`); RLS всех таблиц переводится на функцию доступа «владелец или одобренный участник» (сохрани имя `owns_farm` или замени во всех политиках — без дыр). Проверь RLS тестом от имени двух пользователей.
- `user_settings`: `reminders_in_chat`, `remind_7_days`, `remind_1_day` (default true, true, true).
- `push_tokens` (user_id, token, platform, updated_at), `reminder_log` (farm_id, form_code, period, kind 7d|1d|overdue, sent_at, unique).
- Регистрация: RPC/Edge Function для R1–R2 (демо-код как в `recovery`), вход `signIn` по ИНН/email/телефону (RPC `resolve_login_email` — security definer, без утечки чужих данных: возвращает только email для `signInWithPassword`, при отсутствии — та же ошибка, что при неверном пароле).
- `get_advisors` security/performance — без новых критичных замечаний. Демо-аккаунты v1 (`143512345660`, `143500987654`, `143500111222` / `AgroOkno2026!`) должны продолжать работать.

### 4. Напоминания и push
- Cron в сервере (ежедневно 09:00 Asia/Yakutsk) + `POST /v1/reminders/run` (Bearer `CRON_SECRET`): по каждому хозяйству сроки → `notifications` (+ сообщение в чат, если `reminders_in_chat`) → Expo push по `push_tokens`, если `push_enabled`; без дублей (`reminder_log`). Сервисный ключ используется только здесь.

### 5. Слой данных приложения (`app/src/data`)
- Реализуй все v2-члены `DataModule`: `signIn`, `signUp`, `verifySignUpCode`, `resendCode`, `useOnboardingStep` (role → farm → pending_access → null), `useCreateFarm`, `useFindFarm`, `useRequestAccess`, `useMyJoinRequest`, `useAssistantChat` (оптимистичное сообщение пользователя, `status: 'failed'` без сети, сохранение `proposed_events` через существующий путь создания событий + карточка `saved_event`, `undoEvent` = мягкое удаление), `useUpcomingDeadlines` (офлайн — из локальных данных через `app/src/reports`), `useReminderSettings`/`useUpdateReminderSettings`, `registerPushToken`.
- Базовый URL сервера — `EXPO_PUBLIC_API_URL` (для телефона в LAN: `http://192.168.0.60:3001`; запиши в `app/.env.local` и `.env.example`). Ссылки на XLSX/PDF переключить на сервер (с откатом на относительный `/api` для веба на Vercel).

## Ограничения
- Контракт — только аддитивно + `docs/CONTRACT-CHANGES.md`.
- Не коммить, без деструктивных git-команд; не трогать чужие облачные проекты; секреты не выводить.
- Если для проверки нужен работающий сервер — запускай его в фоне и останавливай по завершении (порт 3001; порт 8081 занят dev-сервером Expo — не трогай его).
- DoD — TZ-v2 §6 (твоя часть: app tsc/lint/test, server typecheck/test/build, живой смоук на Supabase). Финальный отчёт: что сделано, что нет, изменения контракта и схемы, env-переменные, как запустить, риски.
