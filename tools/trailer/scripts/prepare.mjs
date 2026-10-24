// Копирует в public/ всё, что нужно рендеру: шрифты из app/, логотип из docs/figma,
// ролики Flow и музыку из media/trailer (если они уже есть). public/ в git не хранится.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const pub = resolve(here, "..", "public");
const fonts = join(repo, "app", "node_modules", "@expo-google-fonts");

const copy = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};

for (const [pkg, weight, file] of [
  ["unbounded", "600SemiBold", "Unbounded_600SemiBold.ttf"],
  ["onest", "400Regular", "Onest_400Regular.ttf"],
  ["onest", "500Medium", "Onest_500Medium.ttf"],
  ["onest", "600SemiBold", "Onest_600SemiBold.ttf"],
]) {
  const from = join(fonts, pkg, weight, file);
  if (!existsSync(from)) throw new Error(`Нет шрифта ${from} — выполните npm install в app/`);
  copy(from, join(pub, "fonts", file));
}
copy(join(repo, "docs", "figma", "logo.png"), join(pub, "logo.png"));

// Ролики Flow: media/trailer/clips/<имя>.mp4 → public/clips/
rmSync(join(pub, "clips"), { recursive: true, force: true });
const clips = join(repo, "media", "trailer", "clips");
const found = existsSync(clips) ? readdirSync(clips).filter((f) => f.endsWith(".mp4")) : [];
for (const f of found) copy(join(clips, f), join(pub, "clips", f));

const music = join(repo, "media", "trailer", "music.mp3");
rmSync(join(pub, "music.mp3"), { force: true });
if (existsSync(music)) copy(music, join(pub, "music.mp3"));

console.log(`assets: шрифты 4, логотип, роликов ${found.length}${existsSync(music) ? ", музыка" : ""}`);
