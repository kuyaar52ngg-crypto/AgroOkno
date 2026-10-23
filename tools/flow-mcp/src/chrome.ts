import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

import { PROFILE_DIR } from "./paths.js";

export const FLOW_URL = "https://flow.google.com/";
const FLOW_HOST = /^https:\/\/(flow\.google\.com|labs\.google\/fx)/;

// Отдельный порт, чтобы не пересекаться с другими CDP-инструментами (9222, 9333).
const CDP_PORT = Number(process.env.AGRO_FLOW_CDP_PORT ?? 9334);
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;

const CHROME_PATHS = [
  process.env.AGRO_FLOW_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter((p): p is string => Boolean(p));

// Кнопки Flow ищутся по английским подписям, поэтому интерфейс всегда открывается с hl=en.
export function inEnglish(url: string): string {
  const u = new URL(url);
  u.searchParams.set("hl", "en");
  return u.toString();
}

async function cdpUp(): Promise<boolean> {
  try {
    return (await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function chromePath(): string {
  const found = CHROME_PATHS.find((p) => existsSync(p));
  if (!found) throw new Error("Google Chrome не найден. Укажите путь в AGRO_FLOW_CHROME.");
  return found;
}

// Настоящий Chrome с отдельным профилем: вход в Google делает сам пользователь руками, повседневный профиль не трогается.
// Порт отладки слушает только 127.0.0.1 (поведение Chrome по умолчанию).
export async function launchChrome(url = FLOW_URL): Promise<void> {
  if (await cdpUp()) return;
  mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(
    chromePath(),
    [`--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${CDP_PORT}`, "--no-first-run", "--no-default-browser-check", inEnglish(url)],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let i = 0; i < 40; i++) {
    if (await cdpUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Chrome запущен, но порт отладки ${CDP_PORT} не поднялся.`);
}

let browser: Browser | null = null;

export async function chromeRunning(): Promise<boolean> {
  return cdpUp();
}

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  await launchChrome();
  browser = await chromium.connectOverCDP(CDP_URL);
  return browser;
}

export async function getFlowPage(): Promise<Page> {
  const context = (await getBrowser()).contexts()[0];
  if (!context) throw new Error("У Chrome нет контекста браузера — перезапустите окно Flow (flow_open).");
  const page = context.pages().find((p) => FLOW_HOST.test(p.url())) ?? (await context.newPage());
  if (!FLOW_HOST.test(page.url())) await page.goto(inEnglish(FLOW_URL), { waitUntil: "domcontentloaded" });
  await ensureEnglish(page);
  return page;
}

async function ensureEnglish(page: Page): Promise<void> {
  if (!/^https:\/\/flow\.google\.com\//.test(page.url())) return;
  const lang = await page.evaluate(() => document.documentElement.lang).catch(() => "");
  if (!lang || /^en\b/i.test(lang)) return;
  await page.goto(inEnglish(page.url()), { waitUntil: "domcontentloaded" });
}
