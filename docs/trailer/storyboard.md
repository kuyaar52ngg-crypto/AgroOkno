# Трейлер АгроОкно · 40 секунд · 16:9

Идея: **«Один раз ввёл — везде сдал»**. Холодная красивая Якутия → бумажная рутина фермера → приложение делает всё за него → тёплый финал.
Моушн-графика всех 8 сцен — `tools/trailer/` (Remotion, `npm run render` → `media/trailer/agrookno-motion.mp4`). Генеративные кадры из Google Flow (Veo, через MCP `agro-flow`) необязательны: если они лежат в `media/trailer/clips/`, то подставляются в сцены 1, 2 и 7 вместо графики.

| # | Время | Тип | Содержание | Подпись / титр |
|---|---|---|---|---|
| 1 | 0–6 с | clip (Flow) | Рассвет над якутским аласом, иней, табун якутских лошадей | — |
| 2 | 6–11 с | clip (Flow) | Фермер в тёплой одежде с тетрадью и пачкой бланков в холодном сарае, усталый взгляд | «5 форм. 3 ведомства. Каждый месяц.» |
| 3 | 11–14 с | title | «АгроОкно» + логотип | «Один раз ввёл — везде сдал» |
| 4 | 14–18 с | screen | `home-v2.png` — Моё хозяйство | «Всё хозяйство — в одном окне» |
| 5 | 18–22 с | screen | J4 из `s11-chat.png` (кадрировать) — надой голосом | «Скажите: “коровы дали 120 литров”» |
| 6 | 22–26 с | screen | C5/C7 из `s04.png` — отчёт отправлен | «Росстат, Минсельхоз, Сахастат — автоматически» |
| 7 | 26–33 с | clip (Flow) | Фермер у конюшни смотрит в телефон и улыбается, пар изо рта, золотой свет | «Меркурий и похозяйственная книга — там же» |
| 8 | 33–40 с | title | Логотип + «АгроОкно» | «Хакатон · Республика Саха (Якутия) · 2026» |

Переходы — fade 0,5 с (итог ≈ 40 с с учётом наложений). Музыка — любая royalty-free (положить в `media/trailer/music.mp3`).

## Промпты для Flow (английский, один кадр на сцену)

1. `01-alas-dawn` — *Aerial drone shot slowly gliding over a frozen Yakutian alas meadow at sunrise, a herd of shaggy white and bay Yakut horses walking through hoarfrost, birch forest and a small frozen lake, pink-gold winter light, cinematic, ultra realistic, soft wind sound.* (16:9, ~8 с, обрезать до 6)
2. `02-paperwork` — *Medium shot of a tired Yakut farmer in a fur hat and quilted jacket sitting at a wooden table in a cold barn office, flipping through a thick paper notebook and a stack of government forms, steam from breath, single warm lamp, slow push-in, realistic documentary style, quiet paper rustle.* (обрезать до 5)
3. `07-happy-farmer` — *Close-up of the same Yakut farmer in a fur hat standing by a wooden horse stable at golden hour, looking at a smartphone and smiling with relief, horses behind him, breath steam, slow orbit around him, cinematic, warm light, gentle wind.* (обрезать до 7)

Перед генерацией видео проверить картинками (бесплатно): тот же промпт с `type: "image"`.

**Оценка затрат** (по подсказкам Flow на 2026-10): 3 видео × «Veo 3.1 - Fast» ≈ 3 × 20 = 60 кредитов; на «Omni 1.1 Flash» — дешевле (≈ 7–12 за сцену). Точную цену Flow показывает перед запуском; MCP не запустит сцену дороже `max_credits`.
