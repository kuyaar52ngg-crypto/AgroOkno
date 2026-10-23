# Агент A — данные, синхронизация, отчёты

Ты — senior-разработчик бэкенда и слоя данных проекта «АгроОкно». Параллельно с тобой агент B делает UI; вы стыкуетесь только через `app/src/data/contract.ts`.

## Сначала прочитай
1. `C:\AgroOkno\docs\TZ-agents.md` — общее ТЗ (цель, решения, токены, экраны, зоны владения, DoD).
2. `C:\AgroOkno\app\AGENTS.md` — правила Expo SDK 58.
3. `app/src/data/contract.ts` — то, что ты реализуешь.
4. Образцы: `app/src/reports/fermer3.ts`, `app/api/reports/3-fermer.ts`, `app/api/_lib/fermer3-xlsx.ts`, `supabase/migrations/20261023000000_init.sql`, `app/src/lib/supabase.ts`.
5. Для понимания, какие данные нужны экранам: скриншоты `C:/AgroOkno/docs/figma/s01.png`…`s09.png`, особенно 01, 03, 04, 05, 06, 08.

Твоя зона: `supabase/**`, `app/src/data/**` (кроме `contract.ts` и `mock.ts`), `app/src/lib/**`, `app/src/reports/**`, `app/api/**`, `app/templates/**`, `app/.env.example`, `app/.env.local`. Экраны и компоненты не трогай.

## Задачи

### 1. Проект Supabase
- Через Supabase MCP: `list_organizations` → (`get_cost`/`confirm_cost`, если требуется) → `create_project` с именем `agrookno`, регион ближайший к Якутии (ap-northeast-1 / ap-northeast-2 / ap-southeast-1). Дождись статуса ACTIVE (`get_project`).
- Если создание невозможно (лимит бесплатных проектов и т.п.) — НЕ удаляй и не ставь на паузу чужие проекты. Продолжай работу локально (миграции в файлах), а в итоговом отчёте опиши блокер.
- `get_project_url` + `get_publishable_keys` → `app/.env.local` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Секретные ключи никуда не записывай и не выводи.

### 2. Схема БД
- Новая миграция `supabase/migrations/<timestamp>_full_model.sql` (init не редактировать): все сущности контракта — роль и контакты в profiles; поля farms (legal_status), household_members, feed_events, crop_events, report_submissions, report_deadlines (справочник), mercury_connections, mercury_documents, notifications, user_settings, support_tickets; новые значения `livestock_group` (cattle_calves, horses_young, horses_stallions).
- Стиль как в init: клиентские uuid, `updated_at` (moddatetime), `deleted_at`, индексы `(farm_id, updated_at)` для синхронизации.
- RLS на каждой таблице: владелец хозяйства — полный доступ; `council_specialist` — только чтение ЛПХ своего `settlement`. Функции `security definer` с `set search_path = ''`.
- Seed с демо-данными из ТЗ §6 (точные числа из макета, чтобы экраны совпали: табун 29 → +6 −1 −2 = 32, надой октября 1 200 л, 10-СХ: сено 18,0 т, сенаж 6,0 т, зерно 1,2 т, …). Демо-пользователей создай через Auth (способ сверь через `search_docs`).
- Применить: `apply_migration`. Затем `get_advisors` (security и performance) — исправить всё критичное.
- Сгенерировать типы `generate_typescript_types` → `app/src/lib/database.types.ts`.

### 3. Авторизация (`useAuth`)
- Вход по ИНН: валидация формата (10/12 цифр) → `signInWithPassword({ email: <ИНН>@agrookno.app, password })`. Коды ошибок — `AuthError` из контракта (A3: «Неверный ИНН. Проверьте цифры»; неверный пароль → `invalid_credentials`; сеть → `network`).
- Восстановление (A4–A6): по телефону/email из профиля найти пользователя (RPC `security definer` или edge-функция), отправить OTP. Если отправка email/SMS недоступна — демо-режим: код генерируется и проверяется на сервере, в ответе `maskedContact`; честно опиши это в отчёте. После проверки кода — сессия, затем смена пароля.
- `setRole` пишет `profiles.role`; после первого входа без роли UI ведёт на A7.

### 4. Offline-first слой (`app/src/data/`)
- Локальная БД expo-sqlite (на вебе — wasm) — зеркало пользовательских таблиц.
- Запись: сразу в локальную БД (клиентский uuid, `pending_sync = true`) + очередь outbox; фоновая отправка в Supabase (upsert по id), повтор при ошибке.
- Чтение: хуки читают локальную БД и реагируют на её изменения; pull с сервера по `updated_at > last_pulled_at` для каждой таблицы; мягкие удаления применяются локально.
- Сеть: определение online/offline (предпочтительно без новых нативных модулей; иначе подходящий Expo-пакет через `npx expo install`), `useSyncStatus`.
- `Query.loading` — только первая загрузка без кеша; `fromCache` — нет связи с сервером.
- `DataProvider` — инициализация БД, сессии, синхронизации.
- Реализуй **все** хуки `DataModule`. Подписи (`HerdGroup.label/hint`, названия форм) — на русском, как в макете.

### 5. Мапперы отчётов (`app/src/reports/`, чистый TS без RN)
- Расширь `fermer3.ts` под новые группы животных; месячная версия = тот же маппер за месяц.
- Новые: `fermer1.ts`, `fermer2.ts`, `kfh1.ts`, `ip1.ts` — строки/графы сверить с бланками `C:\AgroOkno\ТЗ\*.XLSX` (прочитай их скриптом на exceljs в `app/scripts/`; выпиши номера строк и адреса ячеек) и приказами в `ТЗ/*.pdf`.
- Превью без бланков: `tabun1.ts` (движение табуна + состав, проверка баланса), `sh10.ts` (заготовка кормов по видам, натуральный вес), `iso1r.ts` (поголовье по группам + проверки «сумма по группам» и «совпадает с книгой ЛПХ»).
- `preview.ts` — результат любого маппера → `ReportPreview` (секции/строки/проверки как на экранах C1–C5).
- `routing.ts` — `getEventDestinations(input, farm)`: какие формы/системы затронет событие (надой → журнал, 3-фермер (рег) след. период, 1-ИСО-р; корма → 10-СХ; растениеводство → раздел растениеводства / 1-фермер / 2-фермер; продажа продукции животноводства → Меркурий; ЛПХ → похозяйственная книга).
- `deadlines.ts` — сроки сдачи (из приказов; если точный срок не найден — значение из макета и комментарий).
- Юнит-тесты мапперов (node:test через tsx, или jest-expo): единицы (кг→ц, шт→тыс. шт, л→кг), суммы, баланс поголовья, границы периодов.

### 6. Vercel API (`app/api/`)
- XLSX по образцу `3-fermer.ts` для 3-fermer, 3-fermer-month, 1-fermer, 2-fermer, 1-kfh, 1-ip; бланки скопировать из `ТЗ/` в `app/templates/` (латинские имена). Общий код — в `api/_lib/`.
- `api/reports/submit.ts` — демо-отправка: проверка периода/прав (RLS), запись `report_submissions` с квитанцией `УЧ-<ФОРМА>-<ГОД>-<NNN>`, уведомление; отправленные периоды не пересчитываются.
- `api/receipts/[no].ts` — PDF квитанции; `api/household/extract.ts` — PDF выписки из похозяйственной книги (pdf-lib, TTF-шрифт с кириллицей под OFL в `app/templates/fonts/`), плашка «УЧЕБНЫЙ ДОКУМЕНТ».
- `api/mercury/sync.ts` — демо-синхронизация: создаёт/обновляет `mercury_documents` из продаж с `mercury_status`.
- Все функции: Bearer-токен пользователя, Supabase-клиент от его имени (RLS), валидация параметров, ошибки на русском.
- `getReportDownloadUrl` / `getReceiptUrl`: на вебе — относительный `/api/...`; на нативе — базовый URL из `EXPO_PUBLIC_API_URL` (добавь в `.env.example`).

### 7. Переключение на реальную реализацию
Когда все хуки готовы и `npx tsc --noEmit` проходит — замени в `app/src/data/index.ts` импорт `./mock` на свою реализацию (сохрани проверку `const _contract: DataModule = impl`). `mock.ts` не удаляй.

## Ограничения
- Контракт — только аддитивно, с записью в `docs/CONTRACT-CHANGES.md`.
- Не коммить, не запускай деструктивные git-команды, не трогай чужие проекты Supabase.
- `npx expo install` — если упал из-за параллельной установки агентом B, подожди и повтори.
- Перед завершением: `npx tsc --noEmit`, `npx expo lint`, тесты — зелёные. Итоговый отчёт по ТЗ §8 (плюс: ref проекта Supabase, демо-логины/пароли, список таблиц, какие формы сверены с бланками и как).
