# ТЗ · АгроОкно Admin — отдельная веб-панель администратора

> Дополняет `docs/TZ-v3.md`. Админ уже есть: таблица `public.app_admins(email, user_id)`, функция `public.is_app_admin()` (по `user_id = auth.uid()`), модель помощника — RPC `get/set_assistant_model_settings` и маршруты сервера `/v1/admin/*` (см. `server/src/routes/admin.ts`). Миграция v3 применена к Supabase `mhsbdzthldggdaxsfgig`.

## 1. Что делаем

Отдельное веб-приложение `admin/` (desktop-first, адаптивное до 1024 px; на телефоне — читаемо, но не приоритет). Разделы:

1. **Сводка** — карточки и графики за период (7/30/90 дней): пользователи (всего/новые), хозяйства по статусу (КФХ/ИП/ЛПХ), события журнала, сданные отчёты по формам, подключения «Меркурия» и «Хорриота», сообщения помощнику, открытые обращения; график по дням (события, новые пользователи).
2. **Пользователи** — таблица с поиском (ФИО, email, телефон, ИНН хозяйства), пагинация; карточка: роль, контакты, дата регистрации, последний вход, хозяйства, статус блокировки; действия: заблокировать / разблокировать, выдать / снять права администратора (себя снять нельзя).
3. **Хозяйства** — таблица с поиском и фильтром по статусу; карточка: реквизиты, владелец и участники, запросы доступа, статус «Меркурия»/«Хорриота», сданные отчёты, последняя активность.
4. **Отчёты** — сданные отчёты всех хозяйств (фильтры: форма, год, поиск по хозяйству), номер квитанции, дата.
5. **Сроки** — справочник `report_deadlines`: редактирование срока (`due_month`, `due_day`, `due_month_offset`, `due_year_offset`), `title`, `description`, `comment`.
6. **Поддержка** — обращения (`support_tickets`) со статусом и ответом администратора; ответ уходит пользователю уведомлением в приложении.
7. **Рассылки** — уведомление всем хозяйствам / по статусу (КФХ/ИП/ЛПХ) / выбранным хозяйствам; в приложении появляется в «Уведомлениях», плюс Expo push (если на сервере есть сервисный ключ); история рассылок.
8. **Модель помощника** — то же, что экран `app/src/app/(tabs)/profile/admin.tsx`, но в панели (маршруты `/v1/admin/assistant-settings`, `/v1/admin/models`).
9. **Журнал действий** — все действия администраторов (кто, что, над чем, когда, детали).

Вход — как в приложении: ИНН / email / телефон + пароль (`rpc('resolve_login_email', { p_identifier })` → `signInWithPassword`). После входа `rpc('is_app_admin')`; не админ — экран «Нет доступа» и выход.

## 2. База — миграция `supabase/migrations/20261025010000_admin_panel.sql` (агент A)

- `support_tickets`: + `status text not null default 'new' check in ('new','in_progress','answered','closed')`, `admin_reply text`, `replied_at timestamptz`, `replied_by uuid`.
- `notifications.kind`: расширить check значением `'admin'` (рассылки и ответы поддержки).
- `admin_audit_log(id uuid pk, admin_id uuid, admin_email text, action text, target_type text, target_id text, details jsonb, created_at)`; RLS: select только `is_app_admin()`, запись — только из RPC (security definer) и сервисным ключом.
- `admin_broadcasts(id, title, body, target jsonb, farms_count int, push_sent int default 0, created_by uuid, created_at)`; RLS как у журнала.
- Все RPC ниже — `security definer`, `set search_path = ''`, первая строка: `if not public.is_app_admin() then raise exception 'Только для администраторов' using errcode = '42501'; end if;`, `grant execute to authenticated`, `revoke from public, anon`. Каждое изменяющее RPC пишет строку в `admin_audit_log`. Возвращают `jsonb` (snake_case, как ниже).

| RPC | Параметры | Результат |
|---|---|---|
| `admin_stats` | `p_from date, p_to date` | `{ users_total, users_new, farms_total, farms_by_status: {kfh, ip, lph}, events_count, reports_by_form: [{form_code, count}], mercury_connected, horriot_connected, assistant_messages, open_tickets, daily: [{date, events, new_users}] }` |
| `admin_list_users` | `p_search text, p_limit int, p_offset int` | `{ total, items: [AdminUser] }` |
| `admin_get_user` | `p_user_id uuid` | `AdminUser & { farms: [{id, name, inn, legal_status, member_role}], tickets: [{id, number, topic, status, created_at}], events_30d int }` |
| `admin_set_admin` | `p_user_id uuid, p_grant boolean` | `AdminUser` (снять права с себя — ошибка) |
| `admin_list_farms` | `p_search text, p_status text|null, p_limit, p_offset` | `{ total, items: [AdminFarm] }` |
| `admin_get_farm` | `p_farm_id uuid` | `AdminFarm & { address, ogrn, oktmo, book_record_no, invite_code, members: [{user_id, full_name, email, role}], join_requests: [{id, user_id, full_name, status, created_at}], submissions: [{id, form_code, period_year, period_month, receipt_no, submitted_at}] }` |
| `admin_list_submissions` | `p_form text|null, p_year int|null, p_search text, p_limit, p_offset` | `{ total, items: [{id, farm_id, farm_name, inn, form_code, period_year, period_month, status, recipient, receipt_no, submitted_at}] }` |
| `admin_update_deadline` | `p_form_code text, p_patch jsonb` | строка `report_deadlines` (разрешённые ключи: `title, description, comment, due_month, due_day, due_month_offset, due_year_offset`; валидация диапазонов) |
| `admin_list_tickets` | `p_status text|null, p_search text, p_limit, p_offset` | `{ total, items: [{id, number, topic, related_section, message, status, admin_reply, replied_at, created_at, farm_id, farm_name, user_full_name, user_email}] }` |
| `admin_reply_ticket` | `p_ticket_id uuid, p_reply text|null, p_status text` | тикет; при непустом ответе — уведомление `kind='admin'` хозяйству «Ответ поддержки · <номер>» |
| `admin_broadcast` | `p_title text, p_body text, p_target text ('all'|'status'|'farms'), p_status text|null, p_farm_ids uuid[]|null` | `{ broadcast_id, farms_count, user_ids: uuid[] }` (уведомление каждому хозяйству; user_ids — владельцы и одобренные участники, для push) |
| `admin_list_broadcasts` | `p_limit, p_offset` | `{ total, items: [...] }` |
| `admin_list_audit` | `p_action text|null, p_limit, p_offset` | `{ total, items: [{id, admin_email, action, target_type, target_id, details, created_at}] }` |

`AdminUser = { id, full_name, email, phone, role, settlement, created_at, last_sign_in_at, banned_until, is_admin, farms_count }` (email — из `profiles.email`, технический email `auth.users` не показывать).
`AdminFarm = { id, name, inn, legal_status, region, settlement, owner: {id, full_name, email}, members_count, created_at, last_activity_at, mercury_status, horriot_status, reports_submitted }`.

Поиск — `ilike` по нескольким полям, `p_limit` ≤ 100. Миграцию **не применять** — применяет координатор.

## 3. Сервер (агент A) — `server/src/routes/admin.ts`

Проверка прав — RPC `is_app_admin` от имени пользователя (Bearer), 403 иначе.

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/v1/admin/users/:id/block` | `{ reason?: string }` → `auth.admin.updateUserById(id, { ban_duration: '876000h' })` сервисным ключом + запись в `admin_audit_log`; себя нельзя; без `SUPABASE_SERVICE_ROLE_KEY` — 503 «На сервере не задан SUPABASE_SERVICE_ROLE_KEY» |
| POST | `/v1/admin/users/:id/unblock` | `ban_duration: 'none'` + журнал |
| POST | `/v1/admin/broadcasts` | тело как у `admin_broadcast` → RPC от имени пользователя → Expo push по `push_tokens` этих user_ids (сервисным ключом, через существующий модуль push) → `push_sent` в `admin_broadcasts` → `{ broadcast_id, farms_count, push_sent }`; без сервисного ключа — только уведомления, `push_sent: 0` |

CORS: панель на другом домене — убедиться, что `CORS_ORIGINS=*` / список работает с `Authorization`.

Приложение (агент A, минимально): уведомления `kind='admin'` корректно отображаются в F3 (`app/src/data/entities.ts` маппинг; если экран фильтрует kinds — поправить в `app/src/app/(tabs)/profile/notifications.tsx`).

## 4. Веб-панель `admin/` (агент B)

- **Стек:** Vite + React 19 + TypeScript (strict) + react-router-dom + @supabase/supabase-js; графики — `recharts`; без UI-фреймворков, свой небольшой набор компонентов (Button, Input, Select, Table с пагинацией, Card, Badge, Drawer/Modal, Toast, EmptyState, ErrorState, Skeleton).
- **Дизайн:** токены из `docs/TZ-agents.md` §5 и `app/src/constants/theme.ts` (primary `#1E3A8A`, success `#16A34A`, border `#E2E8F0`, радиусы 8/12/16, шрифты Unbounded для заголовков и Onest для текста через Google Fonts). Боковое меню с разделами, шапка с email админа и «Выйти». Все тексты по-русски, даты — `ru-RU`, часовой пояс `Asia/Yakutsk`.
- **Данные:** типизированный слой `admin/src/api/` — RPC через supabase-js, серверные действия (блокировка, рассылка, модель) через `fetch(VITE_API_URL + '/v1/admin/...')` с `Authorization: Bearer <access_token>`. Типы ответов — по таблице §2. Ошибки 42501/403 → «Нет доступа», сеть → понятное сообщение, Render «просыпается» до минуты — показывать загрузку.
- **Env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (`admin/.env.example`; локально `admin/.env.local` с теми же значениями, что в `app/.env.local`, API — `https://agro-okno-server.onrender.com`).
- **Деплой:** `admin/vercel.json` (SPA rewrite на `index.html`), README с запуском (`npm run dev`, `npm run build`). Не деплоить.
- Подтверждение для опасных действий (блокировка, снятие админа, рассылка всем).

## 5. Зоны

| Агент | Владеет |
|---|---|
| **A — база + сервер** | `supabase/**`, `server/**`, `app/src/data/**` (кроме `contract.ts`, `mock.ts`), `app/src/lib/database.types.ts`, правка экрана уведомлений приложения при необходимости |
| **B — веб-панель** | `admin/**` целиком |

Не коммитить, никаких деструктивных git-команд, не трогать удалённые сервисы (Supabase/Vercel/Render). Не менять `app/src/data/contract.ts`.

## 6. Definition of Done

- A: `cd server && npm run typecheck && npm test && npm run build`; `cd app && npx tsc --noEmit && npx expo lint && npm test` — зелёные; тесты новых маршрутов (403, 503 без ключа, блокировка себя запрещена, рассылка с push и без); SQL проверен на локальном Postgres (как в v3), если доступен.
- B: `cd admin && npm run build` и `npx tsc --noEmit` (или `npm run typecheck`) — без ошибок; `npm run lint`, если настроен; ключевые утилиты покрыты тестами (vitest); визуально проверено в браузере (dev-сервер + headless), где возможно — на заглушках ответов.
- Итоговый отчёт: файлы, команды с результатами, что не проверено.
