# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Сборка приложения (EAS Build)

Конфигурация — `eas.json`, идентификаторы приложения (`ru.agrookno.app` для iOS `bundleIdentifier` и Android `package`) — `app.json`. Профили:

| Профиль | Что собирает | Окружение EAS |
|---|---|---|
| `development` | dev-клиент (Android APK, iOS-симулятор), внутреннее распространение | `development` |
| `preview` | Android APK для тестировщиков, внутреннее распространение (ссылка/QR) | `preview` |
| `production` | релизная сборка для магазинов (Android AAB, iOS), `autoIncrement` номера сборки | `production` |

Переменные `EXPO_PUBLIC_*` для сборки берутся из **переменных окружения EAS** (по одному набору на `development` / `preview` / `production`), а не из git. В `eas.json` лежат только несекретные значения без привязки к проекту: `EXPO_PUBLIC_DATA_MODE=real` (защита от случайного включения демо-слоя) и адрес сервера `EXPO_PUBLIC_API_URL` для `preview` и `production`. Адрес Supabase и publishable-ключ публичны по замыслу (доступ ограничивает RLS), но, как и в `.env.local`, в репозиторий не попадают.

### Первая сборка

```bash
npm i -g eas-cli          # или npx eas-cli …
eas login
eas init                  # создаёт проект на expo.dev и записывает extra.eas.projectId в app.json
# переменные окружения EAS: по одной команде на каждое окружение (development, preview, production)
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --environment preview --visibility plaintext
eas build -p android --profile preview      # APK; ссылка на скачивание появится в консоли и на expo.dev
```

Видимость `plaintext` или `sensitive` (значения попадают в клиентский код, «secret» для `EXPO_PUBLIC_*` не подходит). Локально те же значения можно получить командой `eas env:pull --environment preview` (запишет локальный env-файл). Проверить заданное: `eas env:list`.

Профиль `development` собирает dev-клиент и требует пакет `expo-dev-client`, который в проект намеренно не добавлен (иначе `expo start` по умолчанию переключился бы с Expo Go на dev-клиент). Перед первой dev-сборкой выполните `npx expo install expo-dev-client`.

### Push-уведомления

Push (`expo-notifications`) **не работают в Expo Go** (с SDK 53 на Android удалённые push там недоступны) и в вебе. Для проверки напоминаний нужна dev-сборка (`eas build -p android --profile development`) или `preview`/`production`; на Android для FCM понадобится ключ Firebase (`google-services.json`, `eas credentials`), на iOS — Apple Developer-аккаунт и push-ключ. Токен устройства регистрируется через `registerPushToken`, рассылку делает сервер (`server/`, Expo Push API).

Экраны, офлайн-режим и вход можно проверять в Expo Go без сборки.

## Мониторинг ошибок (Sentry, необязательно)

По умолчанию выключен. Включается переменной `EXPO_PUBLIC_SENTRY_DSN` (задаётся при сборке: в `.env.local`, в переменных EAS или в настройках проекта Vercel). Без неё `src/lib/monitoring.ts` — пустая заглушка: `@sentry/react-native` не попадает в бандл (Metro вырезает ветку), сетевых вызовов нет.

- Корневой layout обёрнут в `Sentry.wrap`, ошибки синхронизации с сервером (первая ошибка серии) отправляются через `captureError`.
- Персональные данные не отправляются: `sendDefaultPii` выключен, тапы и трассировки не собираются, строки в событиях очищаются от email, телефонов и длинных чисел (ИНН), у пользователя только `id`.
- Expo Go: SDK работает только в части JS-ошибок (нативные краши и офлайн-кеш недоступны). На вебе с включённым Sentry бандл больше примерно на 1,6 МБ (без minify-gzip около 0,5 МБ), поэтому DSN для веб-сборки задавайте осознанно.
- Плагин `@sentry/react-native` в `app.json` не подключён: он нужен только для загрузки source maps при нативной сборке и требует `SENTRY_AUTH_TOKEN`, организацию и проект. Чтобы получить читаемые стеки в нативных сборках, добавьте его вручную (`"plugins": [["@sentry/react-native/expo", { "organization": "…", "project": "…" }]]`) и положите токен в EAS как секрет `SENTRY_AUTH_TOKEN`.

## E2E-тесты (Playwright)

Сценарии: вход, добавление события (надой) в журнал, предпросмотр отчёта, офлайн-плашка. Файлы — `e2e/*.spec.ts`, конфигурация — `playwright.config.ts`.

```bash
npx playwright install chromium   # один раз (если не скачивается — тесты возьмут установленный Google Chrome; или E2E_CHANNEL=msedge)
npm run test:e2e                  # собирает веб-версию в режиме mock, поднимает сервер и запускает тесты (headless chromium)
E2E_SKIP_BUILD=1 npm run test:e2e # без пересборки (e2e/.dist уже собран)
```

Тесты идут на демо-слое данных `src/data/mock.ts`: сборка с `EXPO_PUBLIC_DATA_MODE=mock` подставляет его вместо реальной реализации (`src/data/index.ts`), прод-база и сервер не затрагиваются. В обычной сборке (`npx expo export -p web` без переменной) mock в бандл не попадает и поведение не меняется. Демо-вход: ИНН `143512345660`, пароль `AgroOkno2026!`. Юнит-тесты (`npm test`) e2e не запускают: они лежат в `e2e/` и называются `*.spec.ts`.
