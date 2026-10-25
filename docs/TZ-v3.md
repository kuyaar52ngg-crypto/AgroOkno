# ТЗ v3 · АгроОкно: ВетИС «Хорриот», помощник через OpenRouter, админ-панель модели

> Дополняет `docs/TZ-agents.md` (v1) и `docs/TZ-v2.md`. Всё оттуда действует (стек, токены, компоненты, правила контракта, офлайн-подход), если ниже не сказано иное.
> Контракт v3 уже добавлен координатором в `app/src/data/contract.ts` (см. `docs/CONTRACT-CHANGES.md`, запись 2026-10-25).

## 1. Зачем

Кейс 2 хакатона: «мобильная региональная версия Электронной похозяйственной книги… с возможностью увязки со сведениями, внесёнными в компонент «Хорриот» ФГИС ВетИС». Сейчас связи с «Хорриотом» нет. Плюс: ИИ-помощник переводим с Anthropic SDK на OpenRouter, модель выбирает администратор для всех пользователей.

## 2. Решения

| Вопрос | Решение |
|---|---|
| «Хорриот» | **Демо, как «Меркурий»** (реальной интеграции нет, всё помечено плашками «учебный режим»). Подключение `connected_demo` → «Передать данные»: каждая запись `livestock_movements` без записи в Хорриоте превращается в учебную запись `УЧ-ХР-NNN`: `registration` для `opening_balance, birth, purchase, transfer_in`; `disposal` для `sale, sale_slaughter, slaughter, death, transfer_out`. Идемпотентно (по `source_movement_id`). |
| Связь с книгой | **Сверка** «книга ЛПХ ↔ Хорриот» по группам на сегодня: `book_heads` = `balanceOn(movements, today)`, `horriot_heads` = Σregistration − Σdisposal; `diff = book − horriot`. Показывается на экране Хорриота, во вкладке «Скот» книги и разделом в PDF-выписке. |
| LLM | **OpenRouter** (`POST https://openrouter.ai/api/v1/chat/completions`, OpenAI-формат, tool calling) через `fetch` (без SDK, как `stt/openai.ts`). `@anthropic-ai/sdk` удалить. Модели: основная + запасные через параметр `models` OpenRouter. Без `OPENROUTER_API_KEY` — правиловый разбор, как сейчас. |
| Выбор модели | Глобальная настройка в БД (`app_settings`, ключ `assistant_model`), по умолчанию `anthropic/claude-haiku-5.5` + бесплатные запасные (реальные id с `:free` и поддержкой tools — проверить по `GET https://openrouter.ai/api/v1/models`, ключ не нужен). Сервер читает настройку с кешем 30 с; при недоступности БД — `OPENROUTER_MODEL` из env. |
| Админ | Таблица `app_admins(email, user_id)`, сид: `kuyaar52ngg@gmail.com` без `user_id`. `is_app_admin()` — security definer: `user_id = auth.uid()`. По email права не выдаются (email в профиле редактируется, демо-код регистрации приходит в ответе); `user_id` координатор проставляет вручную после регистрации. |

## 3. База (одна миграция `supabase/migrations/20261025000000_v3_horriot_admin.sql`)

- `horriot_connections` (как `mercury_connections`: PK `farm_id`, `status` check `not_connected|connected_demo`, `synced_at`, timestamps, `deleted_at`).
- `horriot_records`: `id uuid` (клиентский), `farm_id`, `number`, `kind` check `registration|disposal`, `animal_group livestock_group`, `heads int > 0`, `reason text`, `registered_on date`, `source_movement_id uuid null`, timestamps, `deleted_at`; уникальные `(farm_id, number)` и `(source_movement_id)` where `deleted_at is null`; индекс `(farm_id, updated_at)`.
- RLS обеих таблиц — `owns_farm(farm_id)` (как у Меркурия), триггеры `set_updated_at`.
- `app_admins`, `app_settings(key text pk, value jsonb, updated_at, updated_by)`; RLS: прямой доступ только `is_app_admin()`.
- RPC: `is_app_admin() → boolean`; `get_assistant_model_settings() → jsonb` (security definer, `grant execute to authenticated`, читают все — серверу нужна модель при запросе любого пользователя); `set_assistant_model_settings(p_model text, p_fallbacks text[]) → jsonb` (только админ, иначе исключение с русским текстом; пишет `updated_by` = email).
- Миграцию **не применять** самостоятельно — применяет координатор через Supabase MCP. Обновить `app/src/lib/database.types.ts` вручную в стиле файла.

## 4. API сервера (новое)

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/v1/horriot/sync` (+ `/api/horriot/sync`) | обработчик `app/api/horriot/sync.ts` через `REPORT_ROUTES` (как `/mercury/sync`) |
| GET | `/v1/admin/me` | `{ is_admin }` (RPC `is_app_admin` от имени пользователя) |
| GET/PUT | `/v1/admin/assistant-settings` | чтение / запись `AssistantModelSettings` (PUT — только админ: 403 иначе; валидация zod: модель — непустая строка, ≤ 3 запасных, без дублей) |
| GET | `/v1/admin/models` | список `AssistantModelOption[]` из OpenRouter: только `supported_parameters` содержит `tools`; `free` = id оканчивается на `:free` или цена prompt и completion = 0; кеш 10 мин; только админ |

`/health` → `providers.llm: 'openrouter' | 'rules'`, плюс `model` текущей настройки. Ответ `/v1/assistant/messages` дополнительно содержит `model_used` (если LLM).

## 5. Зоны владения

| Агент | Владеет |
|---|---|
| **C3 — данные + сервер** | `supabase/**`, `server/**`, `app/src/data/**` (кроме `contract.ts`, `mock.ts`), `app/src/lib/**`, `app/src/reports/**`, `app/api/**`, `app/.env.example`, документация сервера |
| **D3 — UI** | `app/src/app/**`, `app/src/components/**`, `app/src/constants/**`, `app/src/hooks/**`, `app/src/data/mock.ts` |
| Координатор | `contract.ts`, `docs/CONTRACT-CHANGES.md`, `docs/TZ-v3.md`, применение миграций, деплой |

Нужен новый тип/хук в контракте — не правьте контракт, напишите в итоговом отчёте (координатор добавит). Не коммитить, никаких деструктивных git-команд, не менять `app/src/data/index.ts` (остаётся `impl`), не трогать удалённые сервисы (Supabase/Vercel/Render) — только чтение публичного API OpenRouter для списка моделей.

## 6. Definition of Done

- `cd app && npx tsc --noEmit && npx expo lint && npm test` — зелёные; `npx expo export -p web` собирается.
- `cd server && npm run typecheck && npm test && npm run build` — зелёные.
- Тесты: планировщик и сверка Хорриота (`app/src/reports/__tests__`), OpenRouter-движок с подменой `fetch` (запрос: `models`, tools в OpenAI-формате, system первым сообщением; разбор `tool_calls`; невалидный JSON/ошибка → правила), админ-маршруты (403 не-админу).
- Итоговый отчёт: что сделано, файлы, команды и их результат, что не проверено.
