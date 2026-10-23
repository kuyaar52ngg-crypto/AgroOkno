import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { FONT_BODY, FONT_TITLE } from "./paths.js";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
export const FFMPEG: string = process.env.AGRO_FFMPEG ?? (require("ffmpeg-static") as string);

// ─── Описание трейлера ──────────────────────────────────────────────────────

export type Segment =
  /** Ролик из Flow (или любой видеофайл). caption — подпись внизу кадра. */
  | { kind: "clip"; file: string; trim_start?: number; duration?: number; caption?: string }
  /** Титр на цветном фоне: заголовок Unbounded + подзаголовок Onest, логотип сверху. */
  | { kind: "title"; text: string; subtitle?: string; duration: number; background?: string; color?: string; logo?: string }
  /** Экран приложения (скриншот) въезжает в кадр; рядом — заголовок и пояснение. */
  | { kind: "screen"; file: string; duration: number; title?: string; subtitle?: string; background?: string }
  /** Неподвижная картинка с медленным наездом камеры. */
  | { kind: "still"; file: string; duration: number; zoom?: "in" | "out"; caption?: string };

export interface TrailerSpec {
  output: string;
  size?: "1920x1080" | "1080x1920";
  fps?: number;
  transition?: number;
  segments: Segment[];
  /** Логотип в углу на всём ролике (кроме титров), png с прозрачностью. */
  watermark?: string;
  music?: { file: string; volume?: number };
  /** Оставить звук роликов Flow (Veo генерирует звук). Если есть music — микшируется тише. */
  keep_clip_audio?: boolean;
}

const BRAND = { primary: "#1E3A8A", background: "#F8FAFC", text: "#0F172A", secondary: "#64748B" };

// ─── Экранирование для filtergraph ──────────────────────────────────────────

/** Путь для опций фильтра: прямые слеши, экранированное двоеточие, в одинарных кавычках. */
export function filterPath(p: string): string {
  return `'${p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''")}'`;
}

const color = (c: string) => c.replace("#", "0x");

/** Текст кладётся во временный файл (textfile=), чтобы не экранировать кириллицу, двоеточия и проценты. */
function textFile(work: string, text: string): string {
  const path = join(work, `t-${Math.random().toString(36).slice(2, 10)}.txt`);
  writeFileSync(path, text, "utf8");
  return filterPath(path);
}

function drawText(work: string, o: { text: string; font: string; size: number; color: string; x: string; y: string; fadeAt?: number; box?: boolean }): string {
  const alpha = o.fadeAt === undefined ? "" : `:alpha='if(lt(t,${o.fadeAt}),0,min(1,(t-${o.fadeAt})/0.5))'`;
  const box = o.box ? ":box=1:boxcolor=0x0F172A@0.55:boxborderw=24" : "";
  return `drawtext=fontfile=${filterPath(o.font)}:textfile=${textFile(work, o.text)}:fontsize=${o.size}:fontcolor=${color(o.color)}:x=${o.x}:y=${o.y}${alpha}${box}`;
}

// ─── ffmpeg ─────────────────────────────────────────────────────────────────

async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`ffmpeg: ${(e.stderr || e.message).trim().split("\n").slice(-4).join(" | ")}`);
  }
}

async function probe(file: string): Promise<{ duration: number; audio: boolean }> {
  // ffmpeg без выходного файла завершается с ошибкой, но описание потоков печатает в stderr.
  const res = await run(FFMPEG, ["-hide_banner", "-i", file], { windowsHide: true }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(res.stderr ?? "");
  if (!m) throw new Error(`Не удалось определить длительность ${file}`);
  return { duration: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]), audio: /Stream #.*Audio:/.test(res.stderr ?? "") };
}

export async function probeDuration(file: string): Promise<number> {
  return (await probe(file)).duration;
}

const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];

/** Смещения переходов xfade: каждый следующий сегмент начинается на `transition` раньше конца предыдущего. */
export function xfadeOffsets(durations: number[], transition: number): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < durations.length - 1; i++) {
    acc += durations[i] - transition;
    offsets.push(Number(acc.toFixed(3)));
  }
  return offsets;
}

export const totalDuration = (durations: number[], transition: number) =>
  durations.reduce((a, b) => a + b, 0) - transition * Math.max(0, durations.length - 1);

// ─── Рендер сегментов ───────────────────────────────────────────────────────

async function renderSegment(seg: Segment, i: number, work: string, W: number, H: number, fps: number): Promise<{ file: string; duration: number; audio: boolean }> {
  const out = join(work, `seg-${String(i).padStart(2, "0")}.mp4`);
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}`;
  const portrait = H > W;

  if (seg.kind === "clip") {
    if (!existsSync(seg.file)) throw new Error(`Нет файла ${seg.file}`);
    const info = await probe(seg.file);
    const start = seg.trim_start ?? 0;
    const duration = Math.min(seg.duration ?? info.duration - start, info.duration - start);
    const caption = seg.caption
      ? "," + drawText(work, { text: seg.caption, font: FONT_BODY, size: Math.round(H / 22), color: "#FFFFFF", x: "(w-text_w)/2", y: `h-text_h-${Math.round(H / 9)}`, fadeAt: 0.3, box: true })
      : "";
    const audioArgs = info.audio ? ["-c:a", "aac", "-ar", "48000", "-ac", "2"] : ["-an"];
    await ffmpeg(["-ss", String(start), "-t", String(duration), "-i", seg.file, "-vf", `${fit}${caption}`, ...ENCODE, ...audioArgs, out]);
    return { file: out, duration, audio: info.audio };
  }

  if (seg.kind === "title") {
    const bg = seg.background ?? BRAND.primary;
    const fg = seg.color ?? "#FFFFFF";
    const titleSize = Math.round(Math.min(W, H) / (portrait ? 11 : 12));
    const inputs = ["-f", "lavfi", "-t", String(seg.duration), "-i", `color=c=${color(bg)}:s=${W}x${H}:r=${fps}`];
    const parts = [
      drawText(work, { text: seg.text, font: FONT_TITLE, size: titleSize, color: fg, x: "(w-text_w)/2", y: `(h-text_h)/2${seg.subtitle ? `-${titleSize * 0.6}` : ""}`, fadeAt: 0.2 }),
    ];
    if (seg.subtitle)
      parts.push(drawText(work, { text: seg.subtitle, font: FONT_BODY, size: Math.round(titleSize * 0.42), color: fg, x: "(w-text_w)/2", y: `(h/2)+${titleSize * 0.55}`, fadeAt: 0.6 }));
    let graph = `[0:v]${parts.join(",")},format=yuv420p[v]`;
    if (seg.logo) {
      inputs.push("-loop", "1", "-t", String(seg.duration), "-i", seg.logo);
      const logoH = Math.round(titleSize * 1.6);
      graph =
        `[0:v]${parts.join(",")}[bg];` +
        `[1:v]scale=-1:${logoH},format=rgba,fade=in:st=0:d=0.5:alpha=1[logo];` +
        `[bg][logo]overlay=(W-w)/2:(H/2)-${Math.round(titleSize * 1.4 + logoH)},format=yuv420p[v]`;
    }
    await ffmpeg([...inputs, "-filter_complex", graph, "-map", "[v]", ...ENCODE, out]);
    return { file: out, duration: seg.duration, audio: false };
  }

  if (seg.kind === "screen") {
    if (!existsSync(seg.file)) throw new Error(`Нет файла ${seg.file}`);
    const bg = seg.background ?? BRAND.background;
    const phoneH = Math.round(H * (portrait ? 0.62 : 0.86));
    // Экран приложения в «рамке телефона»: тёмная окантовка 14px, въезд снизу с затуханием.
    const phoneX = portrait ? "(W-w)/2" : `W*0.58`;
    const phoneY = portrait ? `H*0.30+max(0,(1-t/0.7))*120` : `(H-h)/2+max(0,(1-t/0.7))*120`;
    const textX = portrait ? "(w-text_w)/2" : "w*0.08";
    const titleSize = Math.round(Math.min(W, H) / 16);
    const graph = [
      `[1:v]scale=-1:${phoneH},pad=iw+28:ih+28:14:14:color=0x0F172A,format=rgba,fade=in:st=0:d=0.5:alpha=1[phone]`,
      `[0:v][phone]overlay=x='${phoneX}':y='${phoneY}'[base]`,
      `[base]` +
        [
          seg.title ? drawText(work, { text: seg.title, font: FONT_TITLE, size: titleSize, color: BRAND.text, x: textX, y: portrait ? "h*0.10" : "h*0.38", fadeAt: 0.3 }) : "null",
          seg.subtitle
            ? drawText(work, { text: seg.subtitle, font: FONT_BODY, size: Math.round(titleSize * 0.5), color: BRAND.secondary, x: textX, y: portrait ? `h*0.10+${titleSize * 1.5}` : `h*0.38+${titleSize * 1.6}`, fadeAt: 0.6 })
            : "null",
        ].join(",") +
        `,format=yuv420p[v]`,
    ].join(";");
    await ffmpeg([
      "-f", "lavfi", "-t", String(seg.duration), "-i", `color=c=${color(bg)}:s=${W}x${H}:r=${fps}`,
      "-loop", "1", "-t", String(seg.duration), "-i", seg.file,
      "-filter_complex", graph, "-map", "[v]", ...ENCODE, out,
    ]);
    return { file: out, duration: seg.duration, audio: false };
  }

  // still: медленный наезд (Ken Burns) через zoompan.
  if (!existsSync(seg.file)) throw new Error(`Нет файла ${seg.file}`);
  const frames = Math.round(seg.duration * fps);
  const z = seg.zoom === "out" ? `max(1.12-0.12*on/${frames},1)` : `min(1+0.12*on/${frames},1.12)`;
  const caption = seg.caption
    ? "," + drawText(work, { text: seg.caption, font: FONT_BODY, size: Math.round(H / 22), color: "#FFFFFF", x: "(w-text_w)/2", y: `h-text_h-${Math.round(H / 9)}`, fadeAt: 0.3, box: true })
    : "";
  await ffmpeg([
    "-loop", "1", "-i", seg.file,
    "-vf", `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1${caption}`,
    "-frames:v", String(frames), ...ENCODE, out,
  ]);
  return { file: out, duration: seg.duration, audio: false };
}

// ─── Сборка ─────────────────────────────────────────────────────────────────

export async function assembleTrailer(spec: TrailerSpec): Promise<{ output: string; duration: number; segments: { kind: string; duration: number }[] }> {
  if (!spec.segments.length) throw new Error("Нет сегментов.");
  for (const f of [FONT_TITLE, FONT_BODY]) if (!existsSync(f)) throw new Error(`Нет шрифта ${f} (задайте AGRO_FONT_TITLE / AGRO_FONT_BODY).`);
  const [W, H] = (spec.size ?? "1920x1080").split("x").map(Number);
  const fps = spec.fps ?? 30;
  const td = spec.transition ?? 0.5;
  const work = join(dirname(spec.output), `_work-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const rendered = [];
    for (const [i, seg] of spec.segments.entries()) rendered.push(await renderSegment(seg, i, work, W, H, fps));
    const durations = rendered.map((r) => r.duration);
    const total = totalDuration(durations, td);

    const inputs: string[] = rendered.flatMap((r) => ["-i", r.file]);
    const filters: string[] = [];
    let last = "[0:v]";
    if (rendered.length > 1 && td > 0) {
      xfadeOffsets(durations, td).forEach((offset, k) => {
        const label = `[x${k}]`;
        filters.push(`${last}[${k + 1}:v]xfade=transition=fade:duration=${td}:offset=${offset}${label}`);
        last = label;
      });
    } else if (rendered.length > 1) {
      filters.push(`${rendered.map((_, k) => `[${k}:v]`).join("")}concat=n=${rendered.length}:v=1:a=0[x]`);
      last = "[x]";
    }

    let videoOut = last;
    if (spec.watermark) {
      inputs.push("-loop", "1", "-i", spec.watermark);
      const wm = rendered.length;
      filters.push(`[${wm}:v]scale=-1:${Math.round(H / 14)},format=rgba,colorchannelmixer=aa=0.85[wm]`, `${last}[wm]overlay=W-w-${Math.round(W / 40)}:${Math.round(H / 30)}:shortest=1[vw]`);
      videoOut = "[vw]";
    }

    // Звук: звук роликов (с паузами под титры/экраны) и/или музыка с затуханием в конце.
    const audioMaps: string[] = [];
    const clipAudio = spec.keep_clip_audio && rendered.some((r) => r.audio);
    if (clipAudio) {
      const delays = xfadeOffsets([...durations, 0], td);
      const parts = rendered
        .map((r, k) => (r.audio ? `[${k}:a]adelay=${Math.round((k === 0 ? 0 : delays[k - 1]) * 1000)}:all=1[a${k}]` : ""))
        .filter(Boolean);
      filters.push(...parts);
      const labels = rendered.map((r, k) => (r.audio ? `[a${k}]` : "")).join("");
      filters.push(`${labels}amix=inputs=${parts.length}:normalize=0,volume=${spec.music ? 0.35 : 1}[ca]`);
      audioMaps.push("[ca]");
    }
    if (spec.music) {
      if (!existsSync(spec.music.file)) throw new Error(`Нет файла музыки ${spec.music.file}`);
      inputs.push("-i", spec.music.file);
      const m = inputs.filter((x) => x === "-i").length - 1;
      filters.push(`[${m}:a]atrim=0:${total},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 2)}:d=2,volume=${spec.music.volume ?? 0.8}[mu]`);
      audioMaps.push("[mu]");
    }
    let audioOut: string | undefined;
    if (audioMaps.length === 2) {
      filters.push(`${audioMaps.join("")}amix=inputs=2:normalize=0[aout]`);
      audioOut = "[aout]";
    } else audioOut = audioMaps[0];

    mkdirSync(dirname(spec.output), { recursive: true });
    const maps = rendered.length > 1 || spec.watermark ? ["-map", videoOut] : ["-map", "0:v"];
    await ffmpeg([
      ...inputs,
      ...(filters.length ? ["-filter_complex", filters.join(";")] : []),
      ...maps,
      ...(audioOut ? ["-map", audioOut, "-c:a", "aac", "-b:a", "192k"] : ["-an"]),
      ...ENCODE,
      "-r", String(fps),
      "-t", String(total),
      "-movflags", "+faststart",
      spec.output,
    ]);
    return { output: spec.output, duration: Number(total.toFixed(2)), segments: rendered.map((r, k) => ({ kind: spec.segments[k].kind, duration: r.duration })) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Кадр из видео для предпросмотра. */
export async function extractFrame(video: string, at: number, out: string): Promise<string> {
  mkdirSync(dirname(out), { recursive: true });
  await ffmpeg(["-ss", String(at), "-i", video, "-frames:v", "1", out]);
  return out;
}
