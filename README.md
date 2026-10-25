# АгроОкно

Мобильная платформа для фермеров Республики Саха (Якутия): **«Один раз ввёл — везде сдал»**.
Фермер (глава КФХ/ИП) или владелец ЛПХ вносит события хозяйства один раз — приложение само готовит отчётность для Росстата, Минсельхоза и Сахастата, данные для ВетИС «Меркурий» и похозяйственную книгу. Есть чат-помощник с голосовым вводом (LLM через OpenRouter, модель выбирает администратор), напоминания о сроках и демо-связка похозяйственной книги с ВетИС «Хорриот».


## Стек

| Часть | Технологии |
|---|---|---|
| Мобильное приложение | Expo SDK 58, React Native 0.88, Expo Router, TypeScript, expo-audio |
| Backend | Node.js, Fastify, TypeScript, OpenRouter (LLM-помощник с правиловым fallback, модель выбирает админ), STT (Yandex / OpenAI / mock), cron + Expo push |
| База данных | PostgreSQL 17 (Supabase): RLS, Auth, Edge Functions |
| Веб-панель администратора | Vite, React 19, TypeScript, Supabase RPC, recharts |
| Отчёты | Чистые TS-мапперы форм + заполнение оригинальных XLSX-бланков (exceljs), PDF (pdf-lib) |
| Дизайн | Figma |

## Формы
3-фермер (год и месяц), 1-фермер, 2-фермер, 1-КФХ, 1-ИП — по официальным бланкам; 1-ТАБУН, 10-СХ, 1-ИСО-р — превью в приложении. Отправка в ведомства, «Меркурий» и «Хорриот» — демонстрационная.

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

