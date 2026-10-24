# Промо-ролик АгроОкно · motion design · Higgsfield

Стиль: чистый продуктовый моушн, белое пространство, синие акценты, мягкие тени, spring-анимации.
Длина ≈ 20 с, 16:9 (для соцсетей — дубль 9:16). Трек ~120 BPM, склейки строго в бит.

**Правило:** Higgsfield генерирует только движение камеры и абстрактные эффекты. Цифры, титры, логотип и бейджи
накладываются в монтаже поверх оригинальных скринов — AI искажает текст интерфейса.

Общий хвост для каждого промпта (добавлять в конец):
> Keep the attached UI exactly as is: do not redraw, translate or alter any text, numbers, icons or layout. No people, no hands, no new UI elements, no generated text, no logos. Clean white studio background, blue accents (#2563EB), soft realistic shadows, spring easing, premium tech commercial look.

| # | Время | Сцена | Референс |
|---|---|---|---|
| 0 | 0–2 с | Интро: логотип-окно | `tools/Frame 1.png` (или `docs/figma/logo.png`) |
| 1 | 2–6 с | Экран хозяйства | `docs/figma/home-v2.png` |
| 2 | 6–10 с | Голосовой ввод | `docs/figma/s11-chat.png` — кадрировать чат с микрофоном (J4) |
| 3 | 10–13 с | Сохранённый надой | `docs/figma/s11-chat.png` — кадрировать карточку «120 л» |
| 4 | 13–20 с | Напоминание + финал | `docs/figma/f3-notifications-v2.png` |

---

## 0. Интро — логотип-окно (≈2 с)

**Prompt (image-to-video):**
> Minimal motion-design logo animation on a pure white background based on the attached logo. The window sash swings open smoothly in 3D, then the sun, hills and field lines inside the frame are drawn in with clean strokes, and the two leaves grow up from the bottom with a gentle elastic overshoot. A soft blue glow appears behind the open window. Static camera, then a fast push-in through the window opening. Keep the logo shape and black silhouette exactly as in the reference. No text.

**Монтаж:** zoom-through в проём окна → переход в сцену 1.

## 1. Появление приложения — экран хозяйства (≈4 с)

**Prompt:**
> Dynamic mobile app commercial shot based on the attached screen. A smartphone showing this exact screen rises into the center of the frame from below with a slight 3D tilt and a springy settle, then straightens to face the camera. The farm cards gently lift off the screen one by one with layered depth and soft shadows (parallax). Short quick push-in toward the cards with subtle motion blur. Energetic but controlled movement.

**Монтаж:**
- общий план → крупная карточка → whip-pan склейка в бит;
- light sweep (блик) один раз проходит по карточкам;
- фон — медленно дышащий размытый синий gradient mesh.

## 2. Голосовой ввод — чат с микрофоном (≈4 с)

**Prompt:**
> Close-up of the attached app interface. Fast smooth push-in toward the microphone button. The button softly pulses and concentric blue rings ripple outward from it. A fluid, liquid blue sound waveform appears next to the button and flows gently, conveying voice input. Minimal product commercial, white background, blue color.

**Монтаж:**
- титр **«ПРОСТО СКАЖИТЕ»** — mask reveal по словам снизу вверх + лёгкий blur-in;
- волна синхронизирована с битом;
- в пузыре чата побуквенно печатается «коровы дали 120 литров» (typewriter) поверх оригинального скрина.

## 3. Результат — сохранённый надой (≈3 с)

**Prompt:**
> Product shot based on the attached image. The saved milk-yield card detaches from the screen and floats slightly forward toward the camera with a soft shadow; the background gently falls out of focus (rack focus, shallow depth of field). Short push-in and a soft camera stop. Calm surroundings, the result is clearly visible. Do not add checkmarks, do not change the numbers, logo or card content.

**Монтаж:**
- переход из сцены 2 морфингом: пузырь чата → карточка (shared element transition);
- счётчик **«120 л»** прокручивается 0 → 120 поверх карточки (только в монтаже);
- держать кадр 2–3 с, чтобы зритель прочитал.

## 4. Напоминание и финал (≈7 с)

**Prompt:**
> Fast controlled push-in toward the nearest reporting-deadline card in the attached interface. The card lifts slightly and gets a soft blue halo glow. Then the camera pulls back and the phone glides smoothly to the left with a slight 3D turn, leaving clean empty white space on the right for a final title. Blue-and-white palette, soft shadows, no 360° rotation, no flashes.

**Монтаж:**
- в пустой зоне справа по очереди всплывают бейджи «Росстат», «Минсельхоз», «Сахастат», «Меркурий» (stagger 80 мс, spring);
- телефон уходит, логотип-окно закрывается обратно в знак (зеркально интро — бесшовная петля);
- **«АгроОкно»** собирается по буквам, слоган **«Один раз ввёл — везде сдал»** проявляется blur → резкость;
- используется оригинальный логотип, не сгенерированный.

---

## Результат прогона 2026-10-24

Скрипт `media/promo/generate.sh`, референсы 16:9 в `media/promo/refs`, клипы в `media/promo/clips` (5 с, 720p).
Модель — Seedance 1.5 Pro (`seedance1_5`): единственная из дешёвых, доступная на free-плане (~4.8 кредита/сцена,
1 задача одновременно). Seedance 2.0 Mini, Grok Video 1.5 Lite требуют платный план. Бесплатных моделей нет.

- `00-logo` — годится: окно открывается, наезд камеры, логотип узнаваем.
- `01–04` — движение камеры хорошее, но текст интерфейса через ~1 с превращается в кашу («120 л» → «100 л»).
  В монтаже брать только первые ~0,8 с или использовать как размытый фон; сам экран анимировать
  в Remotion из оригинальных скринов, повторяя движение камеры из клипа.

## Единый моушн-язык

- **Easing:** spring / ease-out-expo, без линейных движений.
- **Переходы:** whip-pan с motion blur, zoom-through, morph. Без «шторок» и стандартных пресетов.
- **Глубина:** мягкие тени, glass-эффект на плашках титров, размытый синий градиент на фоне.
- **Типографика:** гротеск (Inter / Manrope / Onest), крупно, mask reveal.
- **Звук:** UI-звуки (whoosh, click, pop) на каждом появлении, музыка ~110–125 BPM.
