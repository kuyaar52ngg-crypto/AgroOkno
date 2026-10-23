import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";

import { getFlowPage, inEnglish } from "./chrome.js";
import { DOWNLOAD_DIR } from "./paths.js";

// Драйвер интерфейса Google Flow. Подписи кнопок — английские (страница всегда открывается с hl=en).
// Правила: ничего не трогаем в панели аккаунта, не вводим учётные данные, работаем со скоростью человека.

export interface SceneParams {
  name: string;
  prompt: string;
  type: "video" | "image";
  model?: string;
  duration?: number;
  aspect_ratio?: "16:9" | "9:16";
  max_credits: number;
}

export interface FlowState {
  url: string;
  signedIn: boolean;
  inProject: boolean;
  composer?: string;
  hint?: string;
}

const wait = (page: Page, ms: number) => page.waitForTimeout(ms);

export async function getState(): Promise<FlowState> {
  const page = await getFlowPage();
  const url = page.url();
  const signedIn = !/\/about|accounts\.google\.com/.test(url);
  const inProject = /\/project\//.test(url);
  const state: FlowState = { url, signedIn, inProject };
  if (!signedIn) state.hint = "Не выполнен вход. Вызовите flow_open и войдите в Google в открывшемся окне Chrome.";
  else if (!inProject) state.hint = "Вход выполнен, но проект не открыт. Откройте или создайте проект во Flow в окне Chrome.";
  else
    state.composer = await page
      .getByRole("button", { name: "Settings trigger" })
      .innerText({ timeout: 3000 })
      .then((t) => t.replace(/\s+/g, " ").trim(), () => undefined);
  return state;
}

// Меню закрываются по Escape; невидимая подложка открытого меню перехватывает клики — её закрываем кликом.
async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const backdrop = page.locator(".cdk-overlay-backdrop.cdk-overlay-backdrop-showing");
  for (let i = 0; i < 4 && (await backdrop.count().catch(() => 0)); i++) {
    await backdrop.last().click({ force: true, timeout: 4000 }).catch(() => {});
    await wait(page, 400);
  }
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("*")) if (el.scrollTop > 0) el.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await wait(page, 300);
}

async function toProjectGrid(page: Page): Promise<void> {
  await dismissOverlays(page);
  const root = page.url().match(/^https:\/\/[^/]+\/project\/[0-9a-f-]{36}/)?.[0];
  if (root && new URL(page.url()).pathname !== new URL(root).pathname) {
    await page.goto(inEnglish(root), { waitUntil: "domcontentloaded" });
    await wait(page, 2500);
  }
  await scrollToTop(page);
}

async function pickRadio(page: Page, name: string | RegExp): Promise<void> {
  const radio = page.getByRole("radio", { name, exact: typeof name === "string" }).first();
  if (!(await radio.isVisible().catch(() => false))) throw new Error(`Во Flow нет варианта «${name}» для текущего режима/модели.`);
  if (!(await radio.isChecked())) {
    await radio.click();
    await wait(page, 500);
  }
}

async function pickModel(page: Page, model: string): Promise<void> {
  const button = page.getByRole("button", { name: "Select model family" });
  if ((await button.innerText()).toLowerCase().includes(model.toLowerCase())) return;
  await button.click();
  const items = page.getByRole("menuitem");
  await items.first().waitFor({ state: "visible", timeout: 5000 });
  const names = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const index = names.findIndex((n) => n.toLowerCase().includes(model.toLowerCase()));
  if (index < 0) {
    await dismissOverlays(page);
    throw new Error(`Модель «${model}» не найдена. Доступны: ${names.join(", ")}`);
  }
  await items.nth(index).click();
  await wait(page, 700);
}

// Выставляет параметры сцены и возвращает цену в кредитах, которую показывает сам Flow.
async function applySettings(page: Page, s: SceneParams): Promise<number> {
  const probe = page.getByRole("radio", { name: "Image", exact: true });
  for (let i = 0; i < 3 && !(await probe.isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: "Settings trigger" }).click();
    await probe.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  }
  if (!(await probe.isVisible().catch(() => false))) throw new Error("Не удалось открыть настройки генерации Flow.");
  await pickRadio(page, s.type === "image" ? "Image" : "Video");
  if (s.type === "video") await pickRadio(page, "Ingredients");
  if (s.aspect_ratio) await pickRadio(page, s.aspect_ratio);
  if (s.model) await pickModel(page, s.model);
  if (s.type === "video" && s.duration) await pickRadio(page, `${s.duration}s`);
  await pickRadio(page, "x1");
  await wait(page, 600);
  const costText = await page.getByRole("link", { name: /credits?$/ }).innerText();
  await dismissOverlays(page);
  const cost = Number(costText.match(/\d+/)?.[0] ?? NaN);
  if (Number.isNaN(cost)) throw new Error(`Не удалось прочитать цену во Flow («${costText}»).`);
  return cost;
}

async function typePrompt(page: Page, prompt: string): Promise<void> {
  const box = page.locator(".ProseMirror").first();
  await box.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  // Enter во Flow отправляет промпт, поэтому промпт вводится одной строкой.
  await page.keyboard.type(prompt.replace(/\s*\n+\s*/g, " ").trim(), { delay: 8 });
  await wait(page, 500);
}

interface Tile {
  key?: string;
  kind: "video" | "image" | "other";
  label: string;
  busy: boolean;
  error: boolean;
}

// Плитки сетки проекта. Ключ — data-media-id, иначе uuid из src, иначе заголовок (у готового видео id может не быть).
async function readTiles(page: Page): Promise<Tile[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("flow-grid-tile-container")].map((t) => {
      const media = t.querySelector("img[data-media-id], video[data-media-id], img[src], video[src]");
      const id = media && (media.getAttribute("data-media-id") || media.getAttribute("src")?.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0]);
      const label = t.getAttribute("aria-label") ?? "";
      const video = !!t.querySelector("flow-video-tile");
      return {
        key: id || (label ? `title:${label}` : undefined),
        kind: video ? "video" : t.querySelector("flow-image-tile") ? "image" : "other",
        label,
        // Пока идёт генерация, на плитке проценты; у только что запущенного видео ещё нет превью.
        busy: /\d+%/.test((t as HTMLElement).innerText) || (video && !t.querySelector('img[alt="Generated video thumbnail"], video')),
        error: !!t.querySelector("flow-error-tile"),
      } as const;
    }),
  );
}

async function waitForResult(page: Page, before: Set<string>, kind: "video" | "image", timeoutMs: number, onProgress: (p?: string) => void): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let seen = "";
  while (Date.now() < deadline) {
    await wait(page, 2500);
    const tiles = await readTiles(page);
    const fresh = tiles.filter((t) => t.key && !before.has(t.key));
    const done = fresh.find((t) => !t.busy && !t.error && t.kind === kind);
    if (done?.key) {
      // Заголовок видео Flow может поменять сразу после готовности — берём, когда он стабилен два опроса подряд.
      if (!done.key.startsWith("title:") || done.key === seen) return done.key;
      seen = done.key;
      onProgress("Flow завершает видео");
      continue;
    }
    if (fresh.some((t) => t.error) && !fresh.some((t) => t.busy))
      throw new Error("Flow не смог сгенерировать сцену («failed to generate»). Кредиты за неудачу Flow не списывает. Попробуйте переформулировать промпт.");
    const progress = fresh.map((t) => t.label.match(/\d+%/)?.[0]).find(Boolean);
    onProgress(progress ?? (fresh.length ? "генерация" : "ожидание старта"));
  }
  throw new Error(`Flow не закончил за ${Math.round(timeoutMs / 1000)} с. Ролик может появиться позже — заберите его flow_download по названию.`);
}

function tileLocator(page: Page, key: string): Locator {
  if (key.startsWith("title:")) return page.locator(`flow-grid-tile-container[aria-label="${key.slice(6).replace(/"/g, '\\"')}"]`).first();
  return page.locator(`flow-grid-tile-container:has([data-media-id="${key}"]), flow-grid-tile-container:has([src*="${key}"])`).first();
}

// Панель кнопок плитки появляется только при настоящем движении мыши над ней.
async function hover(page: Page, tile: Locator): Promise<void> {
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  else await tile.hover();
  await wait(page, 900);
}

async function renameTile(page: Page, tile: Locator, title: string): Promise<boolean> {
  try {
    await hover(page, tile);
    const more = tile.getByRole("button", { name: "More options" });
    if (!(await more.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false))) return false;
    await more.click();
    const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
    if (!(await rename.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false))) {
      await dismissOverlays(page);
      return false;
    }
    await rename.click();
    await wait(page, 1200);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(title, { delay: 8 });
    await page.keyboard.press("Enter");
    await wait(page, 1500);
    return true;
  } catch {
    await dismissOverlays(page).catch(() => {});
    return false;
  }
}

// Загрузки Chrome направляются в нашу папку; на случай сброса настройки смотрим и в системную ~/Downloads.
const SYSTEM_DOWNLOADS = join(homedir(), "Downloads");
const listDownloads = () => {
  const seen = new Set<string>();
  for (const dir of [DOWNLOAD_DIR, SYSTEM_DOWNLOADS]) if (existsSync(dir)) for (const f of readdirSync(dir)) seen.add(join(dir, f));
  return seen;
};

function sniffExtension(file: string): string {
  const head = Buffer.alloc(12);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return ".mp4";
  if (head[0] === 0xff && head[1] === 0xd8) return ".jpg";
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return ".png";
  if (head.subarray(0, 4).toString("latin1") === "RIFF") return ".webp";
  return ".bin";
}

async function downloadTile(page: Page, tile: Locator, targetStem: string): Promise<string> {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: DOWNLOAD_DIR, eventsEnabled: true }).catch(() => {});
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const before = listDownloads();
      await hover(page, tile);
      const more = tile.getByRole("button", { name: "More options" });
      if (await more.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) await more.click();
      else await tile.click({ button: "right" });
      const download = page.getByRole("menuitem", { name: "Download", exact: true });
      await download.waitFor({ state: "visible", timeout: 8000 });
      await download.click();
      const original = page.getByRole("menuitem", { name: /original/i }).first();
      if (await original.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) await original.click();
      const file = await waitForFile(page, before, 180_000);
      const target = `${targetStem}${sniffExtension(file)}`;
      renameSync(file, target);
      await dismissOverlays(page);
      return target;
    } catch (err) {
      lastError = err;
      await dismissOverlays(page).catch(() => {});
      await wait(page, 2000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function waitForFile(page: Page, before: Set<string>, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last: { path: string; size: number } | undefined;
  while (Date.now() < deadline) {
    await wait(page, 300);
    for (const path of listDownloads()) {
      if (before.has(path) || path.endsWith(".crdownload") || path.endsWith(".tmp")) continue;
      const size = statSync(path).size;
      if (last?.path === path && last.size === size && size > 0) return path;
      last = { path, size };
    }
  }
  throw new Error("Flow начал загрузку, но файл не появился ни в папке MCP, ни в ~/Downloads.");
}

/** Генерирует одну сцену и скачивает результат. Возвращает путь к файлу и цену в кредитах. */
export async function generateScene(
  s: SceneParams,
  outputDir: string,
  onProgress: (p?: string) => void,
): Promise<{ file: string; credits: number; title: string }> {
  const state = await getState();
  if (!state.signedIn || !state.inProject) throw new Error(state.hint);
  const page = await getFlowPage();
  await toProjectGrid(page);

  // Режим «Agent» генерирует без отдельного подтверждения — выключаем, работаем только обычным композером.
  const agent = page.getByRole("button", { name: "Agent", exact: true });
  if ((await agent.getAttribute("aria-pressed").catch(() => null)) === "true") await agent.click();
  const clear = page.getByRole("button", { name: "Clear prompt" });
  if (await clear.isVisible().catch(() => false)) await clear.click();

  onProgress("настройки и цена");
  const credits = await applySettings(page, s);
  if (credits > s.max_credits)
    throw new Error(`Flow просит ${credits} кредитов, это больше лимита max_credits=${s.max_credits}. Ничего не сгенерировано.`);

  await typePrompt(page, s.prompt);
  const start = page.getByRole("button", { name: "Start generation" });
  if (!(await start.isEnabled())) throw new Error("Кнопка Start generation неактивна — Flow не принял промпт.");
  await scrollToTop(page);
  const before = new Set((await readTiles(page)).map((t) => t.key).filter((k): k is string => Boolean(k)));
  await start.click();
  onProgress("запущено");

  const key = await waitForResult(page, before, s.type, s.type === "image" ? 4 * 60_000 : 12 * 60_000, onProgress);
  mkdirSync(outputDir, { recursive: true });
  // Flow сам называет плитки и повторяет названия — переименовываем в имя сцены, чтобы потом находить однозначно.
  const title = `agro-${s.name}`;
  const renamed = await renameTile(page, tileLocator(page, key), title);
  await wait(page, 800);
  const handle = renamed && key.startsWith("title:") ? `title:${title}` : key;
  onProgress("скачивание");
  const file = await downloadTile(page, tileLocator(page, handle), join(outputDir, s.name));
  return { file, credits, title: renamed ? title : key.replace(/^title:/, "") };
}

/** Повторно скачивает готовую плитку по названию — без затрат кредитов. */
export async function downloadByTitle(title: string, outputDir: string, stem: string): Promise<string> {
  const page = await getFlowPage();
  await toProjectGrid(page);
  const tile = tileLocator(page, `title:${title}`);
  if (!(await tile.count())) throw new Error(`Плитка «${title}» не найдена в открытом проекте Flow.`);
  mkdirSync(outputDir, { recursive: true });
  return downloadTile(page, tile, join(outputDir, stem));
}

export async function listTiles(): Promise<{ title: string; kind: string; busy: boolean }[]> {
  const page = await getFlowPage();
  await toProjectGrid(page);
  return (await readTiles(page)).filter((t) => t.label).map((t) => ({ title: t.label, kind: t.kind, busy: t.busy }));
}
