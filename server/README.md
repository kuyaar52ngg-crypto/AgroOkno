# АгроОкно · Node.js-сервер

Единый backend проекта: помощник на LLM через OpenRouter (модель для всех пользователей выбирает администратор; без ключа — правиловый разбор фраз), голосовой ввод (провайдеры `yandex` / `openai` / `mock`), напоминания об отчётах (cron + Expo push), регистрация и участники хозяйства, а также отчёты XLSX/PDF, «Меркурий» и «Хорриот» (демо) — существующие обработчики `app/api/**` подключены адаптером, без дублирования кода.

Стек: Fastify 5 + TypeScript (ESM), zod, `@fastify/cors`, `@fastify/multipart`, `@fastify/swagger` (+ UI на `/docs`), pino, `@supabase/supabase-js`, `node-cron`, `expo-server-sdk`. LLM — прямой `fetch` к OpenRouter (без SDK).

Сервер работает с Supabase **от имени пользователя** (Bearer `access_token` → RLS). Сервисный ключ `SUPABASE_SERVICE_ROLE_KEY` нужен только там, где права пользователя не подходят: задача напоминаний, блокировка пользователей (Supabase Auth Admin API), Expo push рассылок администратора (чтение `push_tokens`) и запись в журнал действий. Без ключа эти функции отключены (блокировка — 503), остальной сервер работает.

## Быстрый старт

```bash
cd server
npm install
cp .env.example .env        # заполнить SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY (те же, что в app/.env.local)
npm run dev                 # http://0.0.0.0:3001 (телефон в LAN: http://<IP-компьютера>:3001)
```

Без ключей `OPENROUTER_API_KEY` / Yandex / OpenAI всё работает: помощник — на правилах (`llm: rules`), голос — `mock` (503 «Распознавание речи не настроено — напишите текстом»).

- Документация API (Swagger UI): http://localhost:3001/docs, схема — `/docs/json`
- Состояние и активные провайдеры: `GET /health`

В приложении (Expo) адрес сервера задаёт `EXPO_PUBLIC_API_URL` в `app/.env.local` (для телефона в LAN — `http://192.168.0.60:3001`). Ссылки на XLSX/PDF приложение строит как `<EXPO_PUBLIC_API_URL>/api/...`; на вебе, развёрнутом на Vercel, остаются относительные `/api/...` (Vercel-функции `app/api` — запасной вариант).

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | tsx watch, порт из `PORT` (по умолчанию 3001), слушает `0.0.0.0` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | node:test (правила помощника J1–J6, движок OpenRouter с подменой `fetch`, настройка модели и админ-маршруты, STT, напоминания, HTTP-слой) |
| `npm run build` | tsup → `dist/index.js` (общий код из `../app/src/reports` и `../app/api/_lib` попадает в бандл) |
| `npm start` | `node dist/index.js` |
| `npm run smoke` | живой смоук против Supabase (см. ниже) |

## Переменные окружения (`.env`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT`, `HOST` | `3001`, `0.0.0.0` | адрес сервера |
| `LOG_LEVEL` | `info` | уровень pino |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | — (обязательны) | проект `agrookno`; публичные значения |
| `SUPABASE_SERVICE_ROLE_KEY` | пусто | **секрет**; cron-напоминания, блокировка пользователей и push рассылок админ-панели. Без него cron не запускается, `POST /v1/reminders/run` и `POST /v1/admin/users/:id/(un)block` отвечают 503, а рассылка создаёт только уведомления в приложении (`push_sent: 0`) |
| `OPENROUTER_API_KEY` | пусто | **секрет**; включает LLM (`llm: openrouter`); без ключа — правила |
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-5.5` | модель помощника, если настройку из БД прочитать не удалось (обычно модель выбирает администратор, см. ниже) |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | базовый адрес API OpenRouter |
| `STT_PROVIDER` | `mock` | `mock` \| `yandex` \| `openai` |
| `YANDEX_API_KEY`, `YANDEX_FOLDER_ID` | пусто | SpeechKit (ru-RU); формат записи — OGG/Opus, MP3 или WAV |
| `OPENAI_API_KEY`, `OPENAI_STT_MODEL` | пусто, `whisper-1` | только распознавание речи (Whisper); принимает m4a/mp3/wav/webm/ogg |
| `CRON_SECRET` | пусто | Bearer-секрет для `POST /v1/reminders/run` |
| `CRON_ENABLED` | `true` | ежедневный cron 09:00 |
| `TZ_REGION` | `Asia/Yakutsk` | часовой пояс cron и «сегодня» помощника |
| `CORS_ORIGINS` | `*` | список источников через запятую |
| `AGRO_TEMPLATES_DIR` | `../app/templates` | бланки xlsx и шрифты PDF (в Docker — `/app/templates`) |

Некорректный `.env` даёт понятную ошибку на русском при старте.

## API (`/v1`, кроме `/health`)

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | статус, версия, провайдеры (`llm: openrouter\|rules`, `stt`), `model` — текущая модель помощника (`null` для правил) |
| POST | `/v1/assistant/messages` | `{ farm_id, text, history? }` → `{ reply: ChatMessage, proposed_events: NewEvent[], needs_clarification, engine: openrouter\|rules, model_used? }` (`model_used` — только если отвечала LLM) |
| POST | `/v1/assistant/transcribe` | multipart `audio` (≤ 5 МБ, ≤ 60 с, `audio/*`), необязательное `duration_ms` → `{ text }` |
| GET/PUT | `/v1/reminders/settings` | настройки J8 (таблица `user_settings`) |
| POST | `/v1/reminders/run` | ручной запуск; `Authorization: Bearer <CRON_SECRET>`, `?dry_run=true` |
| POST | `/v1/push-tokens` | `{ token, platform }` — регистрация Expo push-токена |
| POST | `/v1/farms` | создать хозяйство (R5) |
| GET | `/v1/farms/lookup?q=` | найти по коду `AGRO-0142` или ИНН (R7) |
| POST/GET | `/v1/farms/join-requests` | создать запрос / мои (`?scope=incoming` — входящие владельцу) |
| POST | `/v1/farms/join-requests/:id/approve` \| `/reject` | решение владельца |
| GET/POST | `/v1/reports/<форма>`, `/v1/reports/submit`, `/v1/receipts/:no`, `/v1/household/extract`, `/v1/mercury/sync`, `/v1/horriot/sync` | адаптер к `app/api/**` (те же пути доступны и как `/api/...`); выписка из книги содержит раздел «Хорриот» (учебные данные) |
| GET | `/v1/admin/me` | `{ is_admin }` — id пользователя есть в `app_admins` (RPC `is_app_admin`) |
| GET / PUT | `/v1/admin/assistant-settings` | модель помощника для всех: `{ model, fallback_models[≤3], updated_at, updated_by }`. GET — любой пользователь; PUT — только администратор (иначе 403), валидация: непустая модель, ≤ 3 запасных, без повторов |
| GET | `/v1/admin/models` | `{ models: [{ id, name, free, context_length }] }` — модели OpenRouter с поддержкой tools (`free` — `:free` или нулевая цена), кеш 10 минут, только администратор |
| POST | `/v1/admin/users/:id/block` | `{ reason? }` → `{ user_id, blocked: true, banned_until }`. Supabase Auth `ban_duration = 876000h` (сервисным ключом), строка `user.block` в `admin_audit_log`. Только администратор (403); себя заблокировать нельзя (400, `self_block`); нет `SUPABASE_SERVICE_ROLE_KEY` — 503 «На сервере не задан SUPABASE_SERVICE_ROLE_KEY»; пользователя нет в Auth — 404. Уже выданный access_token действует до истечения срока (обычно час), войти и обновить сессию заблокированный не может |
| POST | `/v1/admin/users/:id/unblock` | `ban_duration = none` → `{ user_id, blocked: false, banned_until: null }`, строка `user.unblock`. Тело не нужно (пустое тело с `Content-Type: application/json` допустимо) |
| POST | `/v1/admin/broadcasts` | `{ title, body, target: all\|status\|farms, status?: kfh\|ip\|lph, farm_ids?: uuid[] }` → `{ broadcast_id, farms_count, push_sent }`. RPC `admin_broadcast` от имени администратора (уведомление `kind = admin` каждому хозяйству + история + журнал `broadcast.send`), затем Expo push владельцам и участникам хозяйств (`push_tokens`, кроме отключивших push в `user_settings`), `push_sent` записывается в `admin_broadcasts`. Без сервисного ключа — только уведомления в приложении, `push_sent: 0`; сбой Expo рассылку не отменяет, недействительные токены удаляются |

Остальные разделы веб-панели (сводка, пользователи, хозяйства, отчёты, сроки, поддержка, журнал) работают напрямую через RPC `admin_*` Supabase (миграция `20261025010000_admin_panel.sql`, права — `is_app_admin()`), сервер им не нужен. Сервер отдаёт панели CORS: при `CORS_ORIGINS=*` отражается любой `Origin`, заголовок `Authorization` в preflight разрешён; для списка источников укажите домен панели в `CORS_ORIGINS`.

Помощник **никогда** не отправляет отчёты и не пишет данные: он возвращает предложенные события `NewEvent`, а приложение сохраняет их через тот же путь, что `useCreateEvent` (офлайн-очередь). Молоко: литры × 1,03 = кг.

## Помощник на OpenRouter

Запрос — `POST {OPENROUTER_BASE_URL}/chat/completions` (OpenAI-формат): `system` первым сообщением, `tools` в виде `{ type: 'function', function: { name, description, parameters } }` (`propose_events`, `ask_clarification`, `report_status`, `how_to`), параметр `models: [основная, ...запасные]` — OpenRouter сам переключается на запасную модель при отказе провайдера. Заголовки `Authorization`, `HTTP-Referer`, `X-Title` (латиницей: `AgroOkno` — значение заголовка HTTP должно быть ByteString), таймаут 25 с. Разбирается `message.tool_calls[0]` (`JSON.parse(arguments)`), события проверяются zod-схемой по типу `NewEvent`, литры молока переводятся в кг. Ошибка сети/API, таймаут, невалидный JSON или невалидное событие → автоматический откат на правиловый разбор.

**Какая модель.** Глобальная настройка лежит в БД (`app_settings`, ключ `assistant_model`; по умолчанию `anthropic/claude-haiku-5.5` + два бесплатных запасных `:free` с tool calling). Сервер читает её RPC `get_assistant_model_settings` от имени пользователя и кеширует на 30 с; если БД недоступна или миграция не применена — берётся `OPENROUTER_MODEL`. Меняет модель администратор (`PUT /v1/admin/assistant-settings`); права — таблица `app_admins` по `user_id` (email только справочно: его можно подменить в профиле). После регистрации администратора выполните `update public.app_admins set user_id = '<uuid>' where email = '<email>';`.

## Напоминания

Cron `0 9 * * *` (часовой пояс `TZ_REGION`) и `POST /v1/reminders/run`: по каждому хозяйству считаются сроки (`app/src/reports/reminders.ts`) → `notifications` + сообщение в чат (`reminders_in_chat`) → Expo push (`push_enabled`, `sound`) по `push_tokens`. Типы: за 7 дней (`remind_7_days`), за 1 день (`remind_1_day`), просрочка. Дубли исключает `reminder_log` (уникальный ключ farm/form/period/kind). Недействительные push-токены удаляются. Старые сообщения чата (> 90 дней) чистит та же задача.

## Живой смоук

```bash
npm run dev            # в одном терминале
npm run smoke          # в другом: вход демо-аккаунтов по ИНН/email/телефону, помощник, голос, RLS на двух пользователях,
                       # регистрация → создание хозяйства → запрос доступа → одобрение, отчёты XLSX/PDF
```

Смоук создаёт двух временных пользователей `Смоук …` (их можно удалить: `delete from auth.users where id in (select id from profiles where full_name like 'Смоук%')`).

## Деплой (на будущее, без реального деплоя)

Docker (сборка из корня репозитория, образ `node:22-alpine`, multi-stage):

```bash
docker build -f server/Dockerfile -t agro-okno-server .
docker run --rm -p 3001:3001 --env-file server/.env agro-okno-server
```

**Render / Railway:** создать Web Service из Docker-образа (Dockerfile path `server/Dockerfile`, build context — корень репозитория), задать переменные окружения из таблицы выше (секреты — только в панели хостинга), health check — `GET /health`. На Render бесплатный тариф «засыпает» — cron сработает только на постоянно работающем тарифе; альтернатива — внешний планировщик, вызывающий `POST /v1/reminders/run` с `CRON_SECRET` (в этом случае поставьте `CRON_ENABLED=false`). После деплоя в `app/.env.local` / переменных EAS укажите `EXPO_PUBLIC_API_URL=https://<ваш-сервис>`.

## Структура

```
src/index.ts        запуск, cron
src/app.ts          Fastify, ошибки, Swagger
src/env.ts          zod-схема окружения
src/supabase.ts     клиент пользователя (RLS) и сервисный
src/assistant/      rules.ts (правила), openrouter.ts (движок), interpret.ts (инструменты и разбор, провайдер-нейтрально), models.ts (настройка модели, каталог OpenRouter), answers.ts, schemas.ts (NewEvent), context.ts, service.ts
src/stt/            mock | yandex | openai
src/reminders/      run.ts (логика), cron.ts, push.ts (expo-server-sdk)
src/admin/          push.ts (Expo push рассылки администратора)
src/routes/         assistant, admin, reminders, farms, reports (адаптер app/api), health
test/               node:test (+ in-memory Supabase для напоминаний)
scripts/smoke.mjs   живой смоук
```
