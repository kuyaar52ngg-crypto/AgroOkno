# АгроОкно Admin — веб-панель администратора

Отдельное веб-приложение для администраторов АгроОкно: сводка, пользователи, хозяйства, отчёты, сроки, поддержка, рассылки, модель помощника и журнал действий. ТЗ: `docs/TZ-admin.md`.

Стек: Vite + React 19 + TypeScript (strict) + react-router-dom + `@supabase/supabase-js` + recharts. Без UI-фреймворков — свой набор компонентов в `src/ui/`.

## Запуск

```bash
cd admin
npm install
cp .env.example .env.local      # заполните значения (см. ниже)
npm run dev                      # http://127.0.0.1:5173
```

Вход — как в приложении: ИНН, email или телефон и пароль (`resolve_login_email` → `signInWithPassword`). После входа панель вызывает `is_app_admin()`; не администратору показывается экран «Нет доступа» с кнопкой «Выйти». Права выдаются записью в таблице `public.app_admins` (`user_id`).

### Переменные окружения

| Переменная | Что это |
|---|---|
| `VITE_SUPABASE_URL` | Адрес проекта Supabase (как `EXPO_PUBLIC_SUPABASE_URL` в приложении) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable-ключ Supabase (публичный; как `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |
| `VITE_API_URL` | Адрес backend (`https://agro-okno-server.onrender.com`): блокировка, рассылки, модель помощника |
| `VITE_MOCK` | Необязательно. `1` — демо-данные вместо реального API |

`.env.local` в git не попадает (см. `admin/.gitignore`); в репозитории только `.env.example`. Сервисные ключи в панель класть нельзя: всё, что требует `service_role` (блокировка, push), выполняет сервер.

## Режим заглушек

```bash
npm run dev:mock        # то же, что VITE_MOCK=1 npm run dev
```

Слой API (`src/api/mock.ts`) отдаёт правдоподобные данные по контракту `docs/TZ-admin.md` §2 без сети и без применённой миграции. Файл подключается динамически только в этом режиме и в обычную сборку не попадает. Подсказки для входа в демо: любой логин и пароль; логин `denied` — вход без прав (экран «Нет доступа»); пароль `wrong` — ошибка входа. Адрес с `?cold` имитирует «просыпающийся» сервер: первый серверный запрос (раздел «Модель помощника») отвечает 7 секунд и показывает плашку ожидания.

## Проверки

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm test                # vitest: форматирование дат и статусов, query-параметры, ошибки, формы
npm run build           # tsc --noEmit + vite build → dist/
npm run preview         # проверить собранную версию
```

## Структура

```
src/
  api/        типы ответов (types.ts), реальный слой (real.ts: RPC + fetch к серверу),
              заглушки (mock.ts), ошибки (errors.ts), нормализация jsonb (normalize.ts)
  auth/       сессия, проверка is_app_admin, вход, охрана разделов
  hooks/      useAsync, useUrlParams (фильтры в адресе), useDebounced
  lib/        чистые функции: даты Asia/Yakutsk, подписи, query, сроки, модель помощника (покрыты тестами)
  layout/     боковое меню и шапка с email админа и «Выйти»
  pages/      9 разделов + карточки /users/:id и /farms/:id
  ui/         Button, Fields, Table (пагинация и сортировка), Card/StatCard, Badge, Overlay (Modal/Drawer),
              ConfirmDialog, Toast, EmptyState/ErrorState, Skeleton
  styles/     токены дизайн-системы АгроОкно и стили
```

Адреса: `/` сводка, `/users`, `/users/:id`, `/farms`, `/farms/:id`, `/reports`, `/deadlines`, `/support` (`?ticket=<номер>` открывает обращение), `/broadcasts`, `/assistant`, `/audit`. Поиск, фильтры, страница и сортировка живут в query-параметрах (`?q=…&status=kfh&page=2`), поиск с дебаунсом 350 мс. Сортировка работает в пределах загруженной страницы (RPC не принимают порядок сортировки).

## Откуда данные

- RPC Supabase (`admin_stats`, `admin_list_users`, `admin_get_user`, `admin_set_admin`, `admin_list_farms`, `admin_get_farm`, `admin_list_submissions`, `admin_update_deadline`, `admin_list_tickets`, `admin_reply_ticket`, `admin_list_broadcasts`, `admin_list_audit`) — вызываются от имени администратора; в БД они проверяют `is_app_admin()` и пишут журнал.
- Справочник сроков читается напрямую из `report_deadlines` (политика чтения открыта авторизованным).
- Сервер (`VITE_API_URL`, заголовок `Authorization: Bearer <access_token>`): `POST /v1/admin/users/:id/block|unblock`, `POST /v1/admin/broadcasts`, `GET|PUT /v1/admin/assistant-settings`, `GET /v1/admin/models`. Сервер на Render после простоя просыпается до минуты — панель показывает плашку ожидания, таймаут запроса 90 секунд.
- Ошибки: `42501`/403 → «Нет доступа», сеть → понятное сообщение с повтором, отсутствие RPC (`PGRST202`) → «База данных не обновлена» (пока не применена миграция `20261025010000_admin_panel.sql`).

## Деплой на Vercel

1. Создайте проект Vercel из этого репозитория, **Root Directory = `admin`**.
2. Framework Preset — Vite (определится сам; параметры закреплены в `vercel.json`): Build Command `npm run build`, Output Directory `dist`.
3. Переменные окружения проекта: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (для Production и Preview). `VITE_MOCK` на Vercel не задавайте.
4. `vercel.json` содержит SPA-rewrite всех путей на `index.html`, поэтому прямые ссылки (`/users/…`, `/farms/…`) открываются после обновления страницы.
5. На сервере (Render) в `CORS_ORIGINS` должен быть адрес панели (или `*`); запросы идут с заголовком `Authorization`.
6. Панель индексировать не нужно: в `index.html` стоит `noindex`.
