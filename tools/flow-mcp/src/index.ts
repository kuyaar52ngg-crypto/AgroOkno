#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { assembleTrailer, extractFrame } from "./assemble.js";
import { chromeRunning, launchChrome } from "./chrome.js";
import { downloadByTitle, getState, listTiles } from "./flow.js";
import { OUTPUT_ROOT } from "./paths.js";
import { allJobs, cancel, enqueue, isBusy, waitForChange } from "./queue.js";

const server = new McpServer({ name: "agro-flow", version: "0.1.0" });

const reply = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (err: unknown) => ({ isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] });
const guarded = <A>(fn: (a: A) => Promise<unknown>) => async (a: A) => {
  try {
    return reply(await fn(a));
  } catch (err) {
    return fail(err);
  }
};

// Подсказки для модели, которая планирует сцены (отдаются в flow_status).
const PLAYBOOK = {
  rules: [
    "Перед любой генерацией видео назовите пользователю ожидаемую сумму кредитов и получите явное согласие; только потом flow_generate с confirm_spend: true.",
    "Сначала проверяйте идеи картинками (type: image) — во Flow они бесплатны — и только потом тратьте кредиты на видео.",
    "Одна сцена = один непрерывный кадр с одним движением камеры. Промпты — на английском.",
    "Повторяйте полное описание персонажа/места в каждой сцене: у Flow нет памяти между сценами.",
    "Вызывайте flow_wait повторно, пока finished не станет true; между сценами пауза 20–45 с.",
  ],
  prompt_order: "subject and action → shot size and camera move → location → visual style → lighting → sound",
  models_hint: "Названия моделей берутся из меню Flow (например «Veo 3.1 - Fast», «Veo 3.1 - Lite», «Omni 1.1 Flash»). Если модель не найдена, ошибка перечислит доступные.",
};

server.registerTool(
  "flow_status",
  {
    description: "Состояние Google Flow: запущен ли Chrome MCP, выполнен ли вход, открыт ли проект, текущие настройки композера; очередь задач и правила планирования сцен.",
  },
  guarded(async () => {
    const running = await chromeRunning();
    const flow = running ? await getState() : { hint: "Окно Chrome для Flow не запущено. Вызовите flow_open." };
    return { flow, queue: allJobs(), output_root: OUTPUT_ROOT, playbook: PLAYBOOK };
  }),
);

server.registerTool(
  "flow_open",
  {
    description:
      "Открывает отдельное окно Chrome (свой профиль MCP) с Google Flow. Вход в Google пользователь выполняет сам, руками — MCP пароли не вводит. Можно передать адрес проекта Flow.",
    inputSchema: { url: z.string().url().optional().describe("Адрес проекта Flow (https://flow.google.com/project/...)") },
  },
  guarded(async ({ url }: { url?: string }) => {
    await launchChrome(url);
    return { opened: true, next: "Войдите в Google в открывшемся окне, откройте или создайте проект, затем вызовите flow_status." };
  }),
);

const sceneShape = z.object({
  name: z.string().regex(/^[a-z0-9-]{2,40}$/).describe("Имя файла сцены: латиница, цифры, дефис (например 01-alas-dawn)"),
  prompt: z.string().min(10).describe("Промпт на английском, один кадр"),
  type: z.enum(["video", "image"]).default("video"),
  model: z.string().optional().describe("Название модели из меню Flow"),
  duration: z.number().int().min(4).max(10).optional().describe("Длительность видео, с (если модель позволяет)"),
  aspect_ratio: z.enum(["16:9", "9:16"]).default("16:9"),
});

server.registerTool(
  "flow_generate",
  {
    description:
      "Ставит сцены в очередь генерации во Flow (по одной, в человеческом темпе) и сразу возвращает id задач. Видео тратит кредиты Flow: нужен confirm_spend: true после согласия пользователя; сцена пропускается без затрат, если Flow просит больше max_credits.",
    inputSchema: {
      scenes: z.array(sceneShape).min(1).max(12),
      max_credits: z.number().int().min(0).default(20).describe("Лимит кредитов на одну сцену"),
      confirm_spend: z.boolean().default(false).describe("true — пользователь согласился потратить кредиты на видео"),
      output_dir: z.string().optional().describe(`Папка для файлов (по умолчанию ${join(OUTPUT_ROOT, "clips")})`),
    },
  },
  guarded(async (a: { scenes: z.infer<typeof sceneShape>[]; max_credits: number; confirm_spend: boolean; output_dir?: string }) => {
    const paid = a.scenes.filter((s) => s.type === "video");
    if (paid.length && !a.confirm_spend)
      throw new Error(
        `${paid.length} видеосцен(ы) тратят кредиты Flow (до ${a.max_credits} за сцену, всего до ${a.max_credits * paid.length}). Спросите пользователя и повторите с confirm_spend: true.`,
      );
    const jobs = enqueue(
      a.scenes.map((s) => ({ ...s, max_credits: s.type === "image" ? 0 : a.max_credits })),
      a.output_dir ?? join(OUTPUT_ROOT, "clips"),
    );
    return { queued: jobs.map((j) => ({ id: j.id, name: j.scene.name, type: j.scene.type })), next: "Вызывайте flow_wait, пока finished не станет true." };
  }),
);

server.registerTool(
  "flow_wait",
  {
    description: "Ждёт прогресса очереди не дольше timeout_seconds (≤ 40) и возвращает состояние всех задач. Повторяйте, пока finished = true.",
    inputSchema: { timeout_seconds: z.number().int().min(1).max(40).default(30) },
  },
  guarded(async ({ timeout_seconds }: { timeout_seconds: number }) => {
    await waitForChange(timeout_seconds * 1000);
    const jobs = allJobs();
    return {
      finished: !isBusy(),
      credits_spent: jobs.reduce((sum, j) => sum + (j.status === "done" && j.scene.type === "video" ? (j.credits ?? 0) : 0), 0),
      jobs,
    };
  }),
);

server.registerTool(
  "flow_cancel",
  {
    description: "Отменяет задачи, которые ещё не начались (все или одну по id). Уже идущую генерацию во Flow остановить нельзя.",
    inputSchema: { job_id: z.string().optional() },
  },
  guarded(async ({ job_id }: { job_id?: string }) => ({ cancelled: cancel(job_id).map((j) => j.id) })),
);

server.registerTool(
  "flow_assets",
  { description: "Список плиток (картинок и видео) в открытом проекте Flow — чтобы скачать готовое без новых затрат." },
  guarded(async () => ({ tiles: await listTiles() })),
);

server.registerTool(
  "flow_download",
  {
    description: "Скачивает готовую плитку из открытого проекта Flow по её названию. Кредиты не тратятся.",
    inputSchema: {
      title: z.string().min(1),
      name: z.string().regex(/^[a-z0-9-]{2,40}$/).describe("Имя файла без расширения"),
      output_dir: z.string().optional(),
    },
  },
  guarded(async ({ title, name, output_dir }: { title: string; name: string; output_dir?: string }) => {
    if (isBusy()) throw new Error("Идёт генерация — дождитесь окончания очереди (flow_wait), чтобы не мешать работе с окном Flow.");
    return { file: await downloadByTitle(title, output_dir ?? join(OUTPUT_ROOT, "clips"), name) };
  }),
);

const segmentShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("clip"), file: z.string(), trim_start: z.number().min(0).optional(), duration: z.number().positive().optional(), caption: z.string().optional() }),
  z.object({
    kind: z.literal("title"),
    text: z.string(),
    subtitle: z.string().optional(),
    duration: z.number().positive(),
    background: z.string().optional(),
    color: z.string().optional(),
    logo: z.string().optional(),
  }),
  z.object({ kind: z.literal("screen"), file: z.string(), duration: z.number().positive(), title: z.string().optional(), subtitle: z.string().optional(), background: z.string().optional() }),
  z.object({ kind: z.literal("still"), file: z.string(), duration: z.number().positive(), zoom: z.enum(["in", "out"]).optional(), caption: z.string().optional() }),
]);

server.registerTool(
  "trailer_assemble",
  {
    description:
      "Собирает трейлер локально через ffmpeg: ролики Flow, титры в фирменном стиле (Unbounded/Onest, #1E3A8A), экраны приложения с анимацией въезда, кадры с наездом камеры, переходы, логотип и музыка. Кредиты не тратит.",
    inputSchema: {
      output: z.string().optional().describe(`Путь к mp4 (по умолчанию ${join(OUTPUT_ROOT, "agrookno-trailer.mp4")})`),
      size: z.enum(["1920x1080", "1080x1920"]).default("1920x1080"),
      fps: z.number().int().min(24).max(60).default(30),
      transition: z.number().min(0).max(2).default(0.5),
      segments: z.array(segmentShape).min(1).max(30),
      watermark: z.string().optional().describe("PNG логотипа в углу"),
      music: z.object({ file: z.string(), volume: z.number().min(0).max(2).optional() }).optional(),
      keep_clip_audio: z.boolean().default(false),
    },
  },
  guarded(async (a: Omit<Parameters<typeof assembleTrailer>[0], "output"> & { output?: string }) => {
    const output = a.output ?? join(OUTPUT_ROOT, "agrookno-trailer.mp4");
    for (const s of a.segments) if ("file" in s && !existsSync(s.file)) throw new Error(`Нет файла: ${s.file}`);
    return assembleTrailer({ ...a, output });
  }),
);

server.registerTool(
  "trailer_frame",
  {
    description: "Сохраняет кадр видео в PNG для предпросмотра (например, чтобы проверить титр или переход).",
    inputSchema: { video: z.string(), at_seconds: z.number().min(0), output: z.string().optional() },
  },
  guarded(async ({ video, at_seconds, output }: { video: string; at_seconds: number; output?: string }) => ({
    frame: await extractFrame(video, at_seconds, output ?? join(OUTPUT_ROOT, "frames", `frame-${at_seconds.toFixed(1)}s.png`)),
  })),
);

await server.connect(new StdioServerTransport());
