# Агент B — UI по макету Figma

Ты — senior React Native / Expo разработчик проекта «АгроОкно». Твоя задача — пиксель-в-пиксель реализовать все экраны макета Figma на Expo Router. Параллельно агент A делает слой данных; вы стыкуетесь только через `app/src/data/contract.ts`.

## Сначала прочитай
1. `C:\AgroOkno\docs\TZ-agents.md` — общее ТЗ (цель, решения, токены, компоненты, таблица экранов с node id, UX-правила, зоны владения, DoD).
2. `C:\AgroOkno\app\AGENTS.md` — правила Expo SDK 58 (сверяйся с версионными доками Expo Router v58, не пиши по памяти).
3. `app/src/data/contract.ts` — типы и хуки, которыми ты пользуешься.
4. Скриншоты макета в `C:/AgroOkno/docs/figma/`: `s01.png`…`s09.png` (разделы 01–09), `components.png`, `logo.png`.

Твоя зона: `app/src/app/**`, `app/src/components/**`, `app/src/constants/**`, `app/src/hooks/**`, `app/src/data/mock.ts`, `app/assets/**`, `app/app.json`. Схему БД, API, мапперы и реальные хуки не трогай.

## Работа с Figma
fileKey `CKSug1Ba2llpJNbRkEIopA`. Сначала `create_session`. Загрузи скилл `figma:figma-design-to-code` перед первым `get_design_context`. По каждому компоненту/экрану: `get_design_context` (node id из ТЗ) → адаптируй под компоненты проекта и токены (не копируй абсолютное позиционирование и web-разметку). Для детальной сверки — `get_screenshot`. Иконки макета — outline 1.5px в стиле Lucide.

## Задачи

### 1. Моки (сделать первым)
`app/src/data/mock.ts` — реализует **весь** `DataModule` на демо-данных из ТЗ §6 и скриншотов (ЛПХ Ивановых, журнал октября, 5 форм, документы Меркурия, уведомления, FAQ). Состояние в памяти, задержка ~300 мс, мутации меняют состояние. Флаг для ручной проверки состояний G1/G2 (например, `globalThis.__AGRO_MOCK__ = { offline: true, slow: true }`). После этого `npx tsc --noEmit` должен проходить для `src/data/index.ts`.

### 2. Чистка шаблона
Удалить остатки create-expo-app: `src/app/index.tsx`, `src/app/explore.tsx`, `components/animated-icon*`, `app-tabs*`, `external-link`, `hint-row`, `web-badge`, `ui/collapsible`, `themed-*`, `hooks/use-color-scheme*`, `use-theme`, `global.css` (если не нужен), шаблонные картинки в `assets/images` и `assets/expo.icon` (заменить своими). `scripts/reset-project.js` — удалить.

### 3. Дизайн-система
- `src/constants/theme.ts` — токены из ТЗ §5 (colors, radius, spacing, shadow, typography-пресеты: h1 Unbounded 28, h2 Unbounded 23/24, title Onest 20/17 SemiBold, body 16/15/14, caption 13, number 32).
- Шрифты: `npx expo install expo-font @expo-google-fonts/onest @expo-google-fonts/unbounded`; загрузка в корневом layout, сплэш держится до загрузки шрифтов.
- Иконки: `npx expo install lucide-react-native react-native-svg`.
- Логотип: скачать SVG/PNG из Figma (node `47:488`, `download_assets` или `get_design_context`) → `assets/brand/`; компонент `Logo` (знак + надпись «АгроОкно» Unbounded, цвет `#1E3A8A`). Иконка приложения, adaptive icon, favicon, splash (`app.json`, фон `#F8FAFC` или `#1E3A8A`). `userInterfaceStyle: "light"`.
- Компоненты в `src/components/ui/` — полный список из ТЗ §5, все состояния из стр. «03 · Компоненты» (node `61:2843`, `93:308`). Доступность: `accessibilityRole`, `accessibilityLabel`, зоны нажатия ≥ 44pt, поддержка `text_size: 'large'` из настроек (масштаб шрифтов).

### 4. Навигация и экраны (Expo Router, typed routes)
Предлагаемая структура (можно улучшить, сохранив переходы из макета):
```
src/app/_layout.tsx            — шрифты, DataProvider, редирект по useAuth().status / role
src/app/(auth)/                — welcome (A1), sign-in (A2/A3), recovery (A4), code (A5), new-password (A6), role (A7)
src/app/(tabs)/_layout.tsx     — BottomNavigation: Хозяйство / Добавить / Отчеты / Профиль
src/app/(tabs)/(home)/         — index «Мое хозяйство», journal (B1/B2), journal/[id] (B3), herd «Учет табуна»,
                                 household (Участок / Члены D1 / Скот D3), household/add-member (D2), household/extract (D4),
                                 mercury (E1/E2), mercury/[id] (E3)
src/app/(tabs)/add/            — index «Новое событие» (табы Животноводство / Растениеводство / Корма = 46:4708, B4, B5, B6), saved (H1)
src/app/(tabs)/reports/        — index «Мои отчеты», [form] превью (C1–C5), [form]/confirm (C6), [form]/sent (C7), [form]/failed (C8)
src/app/(tabs)/profile/        — index (F1), farm (F2), notifications (F3), settings (F4), help (F5), support (F6), support/sent (H3)
src/app/delete-event.tsx       — модалка H2 (presentation: 'transparentModal' / formSheet)
```
- Каждый экран — по своему node id; тексты дословно из макета, данные — из хуков `@/data`.
- «Новое событие»: Животноводство (вид животного chips: КРС/Лошадь/…; событие chips: Рождение/Продажа/Падеж/Забой/Покупка; либо Select «Надой» с группой и объёмом — как B4), Растениеводство (B6), Корма (B5). Counter количества, выбор даты (нативный date picker через Expo-совместимый пакет или собственный календарь), блок «Куда попадут данные» из `getEventDestinations` (обновляется при изменении формы), Сохранить → H1. Редактирование из B3 открывает ту же форму с данными.
- D3: «+» / «−» у группы скота открывает «Новое событие» с предзаполнением (рождение/покупка или падеж/забой/продажа) — поголовье меняется только после сохранения события.
- Отчёты: список с группами «Федеральные» / «Республиканские (Сахастат)», ReportCard со статусами; превью — секции и проверки из `ReportPreview`; «Скачать XLSX»/«Скачать квитанцию» через `getReportDownloadUrl`/`getReceiptUrl` (`expo-web-browser` или `Linking`; на вебе — скачивание файла); C6 → `useSubmitReport` → C7 или C8 (C8 «Повторить» повторяет отправку). В офлайне кнопка отправки неактивна с пояснением.
- Валидация: ИНН 10/12 цифр (A3 — красная рамка и «Неверный ИНН. Проверьте цифры»; пароль при ошибке не стирается), пароль ≥ 8 и буквы+цифры + совпадение (A6, чек-лист в реальном времени), код — 6 ячеек с автопереходом и таймером «Отправить код повторно через 00:42» (A5).
- Служебные состояния: компонент-обёртка экрана показывает skeleton (G1) при `loading`, жёлтый офлайн-Alert при `!online`/`fromCache` (G2) с «Повторить» (`useSyncStatus().retry`). Экран G2 как отдельная главная в офлайне — по макету.

### 5. Качество
- Верстка: ScrollView/FlatList с `SafeAreaView`/insets, клавиатура не перекрывает поля (KeyboardAvoidingView или аналог из доков v58), ширина 360–440, на вебе — центрированная колонка max 440.
- Без хардкода цветов/размеров вне `theme.ts`.
- Проверка: `npx expo start --web` — пройти все экраны и сравнить со скриншотами Figma (можно `get_screenshot` по node id рядом со своим скриншотом из браузера через доступные инструменты). Исправить расхождения в отступах, шрифтах, цветах.

## Ограничения
- Данные — только через `@/data`; никаких прямых обращений к Supabase из экранов.
- Контракт — только аддитивно, с записью в `docs/CONTRACT-CHANGES.md` (если чего-то не хватает экрану — добавь необязательное поле/хук и реализуй в моке; агент A подхватит).
- Не коммить, не запускай деструктивные git-команды.
- `npx expo install` — если упал из-за параллельной установки агентом A, подожди и повтори.
- Перед завершением: `npx tsc --noEmit` и `npx expo lint` — 0 ошибок, `npx expo export -p web` собирается. Итоговый отчёт по ТЗ §8 (плюс: карта маршрутов → экраны макета, что расходится с макетом и почему).
