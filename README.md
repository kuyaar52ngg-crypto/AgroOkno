# АгроОкно

Мобильная платформа для фермеров Республики Саха (Якутия): **«Один раз ввёл — везде сдал»**.
Фермер (глава КФХ/ИП) или владелец ЛПХ вносит события хозяйства один раз — приложение само готовит отчётность для Росстата, Минсельхоза и Сахастата, данные для ВетИС «Меркурий» и похозяйственную книгу. Есть чат-помощник с голосовым вводом и напоминания о сроках.

Хакатон по кейсам ГКУ «РЦПТ РС(Я)» (письмо № 987/574 от 22.10.2026, материалы — `ТЗ/`).

## Стек

| Часть | Технологии | Папка |
|---|---|---|
| Мобильное приложение | Expo SDK 58, React Native 0.88, Expo Router, TypeScript, expo-sqlite (офлайн), expo-audio | `app/` |
| Backend | Node.js, Fastify, TypeScript, Claude API (с правиловым fallback), STT (Yandex / OpenAI / mock), cron + Expo push | `server/` |
| База данных | PostgreSQL 17 (Supabase): RLS, Auth, Edge Functions | `supabase/` |
| Отчёты | Чистые TS-мапперы форм + заполнение оригинальных XLSX-бланков (exceljs), PDF (pdf-lib) | `app/src/reports`, `app/api` |
| Демо-трейлер | Моушн-графика на Remotion (React → MP4); MCP-сервер для Google Flow + сборка через ffmpeg | `tools/trailer/`, `tools/flow-mcp/` |
| Дизайн | Figma | `docs/figma/` |

## Формы
3-фермер (год и месяц), 1-фермер, 2-фермер, 1-КФХ, 1-ИП — по официальным бланкам; 1-ТАБУН, 10-СХ, 1-ИСО-р — превью в приложении. Отправка в ведомства и «Меркурий» — демонстрационная.

## Запуск

```bash
# приложение
cd app && npm install
cp .env.example .env.local   # URL и publishable key Supabase, EXPO_PUBLIC_API_URL
npx expo start               # Expo Go (SDK 58) или --web

# backend
cd server && npm install
cp .env.example .env         # ключи — только локально, не в git
npm run dev                  # http://localhost:3001, документация API — /docs

# проверки
cd app && npx tsc --noEmit && npx expo lint && npm test
cd server && npm run typecheck && npm test
```

Демо-вход (учебные данные): ИНН `143512345660`, пароль `AgroOkno2026!` — ЛПХ Ивановых. Также `143500987654` (КФХ) и `143500111222` (без роли — экран выбора роли).

## Документация
- `docs/TZ-agents.md`, `docs/TZ-v2.md` — техническое задание
- `docs/CONTRACT-CHANGES.md` — контракт между UI и слоем данных (`app/src/data/contract.ts`)
- `docs/trailer/storyboard.md` — раскадровка трейлера
- `server/README.md`, `tools/trailer/README.md`, `tools/flow-mcp/README.md`

> Файл `ТЗ/Сахастат приказ формы.pdf` (129 МБ) не хранится в репозитории — он больше лимита GitHub.
