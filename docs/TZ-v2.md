# ТЗ v2 · АгроОкно: регистрация, чат-помощник, голос, напоминания, Node.js backend

> Дополняет `docs/TZ-agents.md` (v1 — реализован). Всё из v1 (стек, токены, правила, зоны) действует, если ниже не сказано иное.
> Промпты агентов: `docs/agent-C-backend.md`, `docs/agent-D-ui.md`.

## 1. Что меняется

Макет Figma (`CKSug1Ba2llpJNbRkEIopA`) обновлён:

| Раздел | Экраны (node id) | Скриншот |
|---|---|---|
| **03 · Регистрация и первое хозяйство** | R1 Создать аккаунт `128:4666` · R2 Подтвердите контакт `128:4729` · R3 Выбор роли `54:64437` (бывший A7) · R4 Ваше хозяйство `128:4776` · R5 Новое хозяйство `128:4816` · R6 Хозяйство создано `128:4959` · R7 Запросить доступ `128:4881` · R8 Запрос отправлен `128:4920` | `docs/figma/s03-registration.png` |
| **11 · Чат-помощник и напоминания** | J1 Чат-помощник `133:6195` · J2 Надой — ввод сообщения `136:7611` · J3 Запись голоса `133:6292` · J4 Надой сохранен `133:6401` · J5 Уточнение количества `136:7671` · J6 Ответ по отчетам `133:6494` · J7 Микрофон недоступен `133:6616` · J8 Напоминания об отчетах `133:6721` | `docs/figma/s11-chat.png` |
| Мое хозяйство (изменён) | `46:4636` — новый блок «Помощник» (ближайший срок, кнопка микрофона, «Открыть помощника») | `docs/figma/home-v2.png` |
| F3 Уведомления (изменён) | `54:66650` — кнопки «Открыть чат-помощника» и «Настроить напоминания» | `docs/figma/f3-notifications-v2.png` |

Новая страница Figma `04 · Презентация` — питч-дек, к приложению не относится.

## 2. Принятые решения

| Вопрос | Решение |
|---|---|
| Backend | **Единый Node.js-сервер `C:\AgroOkno\server`** (Fastify + TypeScript). Новые API (помощник, голос, напоминания, push, регистрация/доступ) + существующие отчёты/PDF/Меркурий из `app/api` подключаются **без дублирования** (переиспользовать `app/api/_lib`, `app/src/reports`). Функции Vercel (`app/api`) остаются рабочими как запасной вариант. Деплой — «на будущее»: Dockerfile + инструкция для Render/Railway, сейчас запуск локально. |
| Голос | Телефон пишет аудио (`expo-audio`, работает в Expo Go) → `POST /v1/assistant/transcribe` → STT-провайдер за интерфейсом: `yandex` (SpeechKit) \| `openai` (Whisper) \| `mock`, выбор через `STT_PROVIDER` в `.env`. |
| ИИ | Claude API (`@anthropic-ai/sdk`) только на сервере, ключ `ANTHROPIC_API_KEY` в env сервера. Модель — env `ANTHROPIC_MODEL` (по умолчанию актуальная Sonnet). Разбор фразы → события строго по типу `NewEvent` (tool use / structured output + валидация zod). **Без ключа** сервер работает на детерминированном правиловом парсере (надой/приплод/падёж/забой/продажа на русском) — демо не должно зависеть от ключей. |
| Сохранение событий из чата | Сервер **не пишет** события в БД. Он возвращает предложенные `NewEvent`; клиентский слой данных сохраняет их тем же путём, что `useCreateEvent` (офлайн-очередь, синхронизация), и добавляет карточку J4 с «Изменить» / «Отменить запись». |
| Регистрация | Аккаунт по реальному email/телефону (R1) + код (R2, демо-режим с `demoCode` как в восстановлении). Вход (A2) — по **ИНН, email или телефону** (`signIn`). Демо-аккаунты v1 продолжают работать. |
| Доступ к хозяйству | Новое: участники хозяйства. Создатель — владелец; запрос доступа (R7) по коду приглашения `AGRO-<номер записи книги>` или ИНН → владелец подтверждает. RLS — по членству (owner или approved member), не только `owner_id`. |
| Напоминания | Cron на сервере (ежедневно, время Якутска) считает сроки через `app/src/reports/deadlines.ts`/`engine.ts`, создаёт `notifications` и шлёт Expo push (`expo-server-sdk`) по настройкам J8 (за 7 дней / за 1 день, в чате, push, звук). Дубли не создаются (журнал отправок). |
| Push в Expo Go | На Android Expo Go push не поддерживает — получение токена мягко пропускается; работает в development build. На iOS — пробовать, при ошибке тоже пропуск. |

## 3. Контракт (`app/src/data/contract.ts`, раздел «v2»)

Уже добавлен координатором: `SignUpInput`, `OnboardingStep`, `NewFarmInput`, `FarmLookup`, `JoinRequest`, `DeadlineReminder`, `ChatCard`, `ChatMessage`, `VoiceClip`, `AssistantChat`, `ReminderSettings` и члены `DataModule`: `signIn`, `signUp`, `verifySignUpCode`, `resendCode`, `useOnboardingStep`, `useCreateFarm`, `useFindFarm`, `useRequestAccess`, `useMyJoinRequest`, `useAssistantChat`, `useUpcomingDeadlines`, `useReminderSettings`, `useUpdateReminderSettings`, `registerPushToken`.
Правило прежнее: менять только аддитивно, с записью в `docs/CONTRACT-CHANGES.md`.

**Компиляция:** сейчас `npx tsc --noEmit` падает, пока новые члены не реализованы. Первое действие агента C — заглушки в `impl` (≤ 15 минут), агента D — в `mock.ts`. После этого tsc обязан быть зелёным на каждом шаге.

## 4. API сервера (минимум, версия `/v1`)

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | статус, версии, какие провайдеры активны (llm: claude\|rules, stt: yandex\|openai\|mock) |
| POST | `/v1/assistant/messages` | `{ farm_id, text, history? }` → `{ reply: ChatMessage, proposed_events: NewEvent[], needs_clarification: boolean }` |
| POST | `/v1/assistant/transcribe` | multipart audio (≤ 60 с, ≤ 5 МБ) → `{ text }` |
| GET/PUT | `/v1/reminders/settings` | настройки J8 (или через Supabase напрямую — на усмотрение агента C, но одна точка истины) |
| POST | `/v1/reminders/run` | ручной запуск задачи напоминаний (защищён `CRON_SECRET`) |
| POST | `/v1/push-tokens` | регистрация Expo push-токена |
| POST | `/v1/farms` | создать хозяйство (R5) |
| GET | `/v1/farms/lookup?q=` | поиск по коду/ИНН (R7) |
| POST/GET | `/v1/farms/join-requests` | создать / мои запросы (R7–R8) |
| POST | `/v1/farms/join-requests/:id/approve` \| `/reject` | решение владельца |
| GET | `/v1/reports/:form` и др. | адаптер к существующим обработчикам `app/api/**` (XLSX, submit, receipts, household extract, mercury sync) |
| GET | `/docs` | OpenAPI (Swagger UI) |

Аутентификация — Bearer `access_token` Supabase; сервер работает с Supabase **от имени пользователя** (RLS). Сервисный ключ — только для cron-задачи напоминаний и только из env сервера, никогда в клиенте и в репозитории.

## 5. Зоны владения (v2)

| Агент | Владеет |
|---|---|
| **C — backend + данные** | `server/**`, `supabase/**`, `app/src/data/**` (кроме `contract.ts` и `mock.ts`), `app/src/lib/**`, `app/src/reports/**`, `app/api/**`, `app/templates/**`, `app/.env.example`, `app/.env.local` |
| **D — UI** | `app/src/app/**`, `app/src/components/**`, `app/src/constants/**`, `app/src/hooks/**`, `app/src/data/mock.ts`, `app/assets/**`, `app/app.json` |
| Общие | `contract.ts` (аддитивно + changelog), `app/package.json` (только `npx expo install`, при блокировке — подождать и повторить) |

Не коммитить, никаких деструктивных git-команд. Не трогать чужие проекты Supabase/Vercel/Render.

## 6. Definition of Done
- `cd app && npx tsc --noEmit`, `npx expo lint`, `npm test` — зелёные; `npx expo export -p web` собирается.
- `cd server && npm run typecheck && npm test && npm run build` — зелёные; `npm run dev` поднимает сервер на `:3001`.
- Сценарий в Expo Go (iPhone пользователя, SDK 58): чат J1 → «Сегодня коровы дали 120 литров молока» → J4 событие в журнале → «Отменить запись»; голос J3 → J4 (при STT=mock — понятная ошибка и предложение написать текстом); микрофон запрещён → J7; J8 сохраняет настройки; регистрация R1→R2→R3→R4→R5→R6 и R7→R8.
- Итоговый отчёт по формату v1 §8.
