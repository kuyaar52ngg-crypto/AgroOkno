# АгроОкно · Node.js-сервер

Единый backend проекта: помощник на Claude (без ключа — правиловый разбор фраз), голосовой ввод (провайдеры `yandex` / `openai` / `mock`), напоминания об отчётах (cron + Expo push), регистрация и участники хозяйства, а также отчёты XLSX/PDF и «Меркурий» (демо) — существующие обработчики `app/api/**` подключены адаптером, без дублирования кода.

Стек: Fastify 5 + TypeScript (ESM), zod, `@fastify/cors`, `@fastify/multipart`, `@fastify/swagger` (+ UI на `/docs`), pino, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `node-cron`, `expo-server-sdk`.

Сервер работает с Supabase **от имени пользователя** (Bearer `access_token` → RLS). Сервисный ключ `SUPABASE_SERVICE_ROLE_KEY` используется только задачей напоминаний.

## Быстрый старт

```bash
cd server
npm install
cp .env.example .env        # заполнить SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY (те же, что в app/.env.local)
npm run dev                 # http://0.0.0.0:3001 (телефон в LAN: http://<IP-компьютера>:3001)
```

Без ключей `ANTHROPIC_API_KEY` / Yandex / OpenAI всё работает: помощник — на правилах (`llm: rules`), голос — `mock` (503 «Распознавание речи не настроено — напишите текстом»).

- Документация API (Swagger UI): http://localhost:3001/docs, схема — `/docs/json`
- Состояние и активные провайдеры: `GET /health`

В приложении (Expo) адрес сервера задаёт `EXPO_PUBLIC_API_URL` в `app/.env.local` (для телефона в LAN — `http://192.168.0.60:3001`). Ссылки на XLSX/PDF приложение строит как `<EXPO_PUBLIC_API_URL>/api/...`; на вебе, развёрнутом на Vercel, остаются относительные `/api/...` (Vercel-функции `app/api` — запасной вариант).

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | tsx watch, порт из `PORT` (по умолчанию 3001), слушает `0.0.0.0` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | node:test (правила помощника J1–J6, Claude-движок с подменой клиента, STT, напоминания, HTTP-слой) |
| `npm run build` | tsup → `dist/index.js` (общий код из `../app/src/reports` и `../app/api/_lib` попадает в бандл) |
| `npm start` | `node dist/index.js` |
| `npm run smoke` | живой смоук против Supabase (см. ниже) |

## Переменные окружения (`.env`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT`, `HOST` | `3001`, `0.0.0.0` | адрес сервера |
| `LOG_LEVEL` | `info` | уровень pino |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | — (обязательны) | проект `agrookno`; публичные значения |
| `SUPABASE_SERVICE_ROLE_KEY` | пусто | **секрет**; только для cron-напоминаний. Без него cron не запускается, а `POST /v1/reminders/run` отвечает 503 |
| `ANTHROPIC_API_KEY` | пусто | включает Claude (`llm: claude`); без ключа — правила |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | модель помощника |
| `STT_PROVIDER` | `mock` | `mock` \| `yandex` \| `openai` |
| `YANDEX_API_KEY`, `YANDEX_FOLDER_ID` | пусто | SpeechKit (ru-RU); формат записи — OGG/Opus, MP3 или WAV |
| `OPENAI_API_KEY`, `OPENAI_STT_MODEL` | пусто, `whisper-1` | Whisper; принимает m4a/mp3/wav/webm/ogg |
| `CRON_SECRET` | пусто | Bearer-секрет для `POST /v1/reminders/run` |
| `CRON_ENABLED` | `true` | ежедневный cron 09:00 |
| `TZ_REGION` | `Asia/Yakutsk` | часовой пояс cron и «сегодня» помощника |
| `CORS_ORIGINS` | `*` | список источников через запятую |
| `AGRO_TEMPLATES_DIR` | `../app/templates` | бланки xlsx и шрифты PDF (в Docker — `/app/templates`) |

Некорректный `.env` даёт понятную ошибку на русском при старте.

## API (`/v1`, кроме `/health`)

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | статус, версия, провайдеры (`llm: claude\|rules`, `stt`) |
| POST | `/v1/assistant/messages` | `{ farm_id, text, history? }` → `{ reply: ChatMessage, proposed_events: NewEvent[], needs_clarification }` |
| POST | `/v1/assistant/transcribe` | multipart `audio` (≤ 5 МБ, ≤ 60 с, `audio/*`), необязательное `duration_ms` → `{ text }` |
| GET/PUT | `/v1/reminders/settings` | настройки J8 (таблица `user_settings`) |
| POST | `/v1/reminders/run` | ручной запуск; `Authorization: Bearer <CRON_SECRET>`, `?dry_run=true` |
| POST | `/v1/push-tokens` | `{ token, platform }` — регистрация Expo push-токена |
| POST | `/v1/farms` | создать хозяйство (R5) |
| GET | `/v1/farms/lookup?q=` | найти по коду `AGRO-0142` или ИНН (R7) |
| POST/GET | `/v1/farms/join-requests` | создать запрос / мои (`?scope=incoming` — входящие владельцу) |
| POST | `/v1/farms/join-requests/:id/approve` \| `/reject` | решение владельца |
| GET/POST | `/v1/reports/<форма>`, `/v1/reports/submit`, `/v1/receipts/:no`, `/v1/household/extract`, `/v1/mercury/sync` | адаптер к `app/api/**` (те же пути доступны и как `/api/...`) |

Помощник **никогда** не отправляет отчёты и не пишет данные: он возвращает предложенные события `NewEvent`, а приложение сохраняет их через тот же путь, что `useCreateEvent` (офлайн-очередь). Молоко: литры × 1,03 = кг.

Claude используется через tool use (`propose_events`, `ask_clarification`, `report_status`, `how_to`), события проверяются zod-схемой по типу `NewEvent`. Любая ошибка API, отказ (`refusal`) или невалидный ответ → автоматический откат на правиловый разбор.

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
src/assistant/      rules.ts (правила), claude.ts (tool use), answers.ts, schemas.ts (NewEvent), context.ts, service.ts
src/stt/            mock | yandex | openai
src/reminders/      run.ts (логика), cron.ts, push.ts (expo-server-sdk)
src/routes/         assistant, reminders, farms, reports (адаптер app/api), health
test/               node:test (+ in-memory Supabase для напоминаний)
scripts/smoke.mjs   живой смоук
```
