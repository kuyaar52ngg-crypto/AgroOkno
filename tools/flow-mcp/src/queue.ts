import { randomUUID } from "node:crypto";

import { generateScene, type SceneParams } from "./flow.js";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Job {
  id: string;
  scene: SceneParams;
  output_dir: string;
  status: JobStatus;
  progress?: string;
  credits?: number;
  file?: string;
  flow_title?: string;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

const jobs: Job[] = [];
let running = false;
const listeners = new Set<() => void>();

// Пауза между сценами — человеческий темп, без попыток обойти защиту Flow.
const PAUSE_MIN_MS = Number(process.env.AGRO_FLOW_PAUSE_MIN_S ?? 20) * 1000;
const PAUSE_MAX_MS = Number(process.env.AGRO_FLOW_PAUSE_MAX_S ?? 45) * 1000;

const notify = () => listeners.forEach((l) => l());

export function enqueue(scenes: SceneParams[], outputDir: string): Job[] {
  const added = scenes.map((scene): Job => ({ id: randomUUID().slice(0, 8), scene, output_dir: outputDir, status: "queued" }));
  jobs.push(...added);
  void pump();
  return added;
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    let first = true;
    for (let job = next(); job; job = next()) {
      if (!first) {
        job.progress = "пауза между сценами";
        notify();
        await new Promise((r) => setTimeout(r, PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS)));
        if (job.status === "cancelled") continue;
      }
      first = false;
      job.status = "running";
      job.started_at = new Date().toISOString();
      notify();
      try {
        const res = await generateScene(job.scene, job.output_dir, (p) => {
          job.progress = p;
          notify();
        });
        Object.assign(job, { status: "done", file: res.file, credits: res.credits, flow_title: res.title, progress: undefined });
      } catch (err) {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        job.progress = undefined;
      }
      job.finished_at = new Date().toISOString();
      notify();
    }
  } finally {
    running = false;
  }
}

const next = () => jobs.find((j) => j.status === "queued");

export const allJobs = (): Job[] => jobs;
export const isBusy = (): boolean => jobs.some((j) => j.status === "queued" || j.status === "running");

export function cancel(id?: string): Job[] {
  const hit = jobs.filter((j) => j.status === "queued" && (!id || j.id === id));
  hit.forEach((j) => (j.status = "cancelled"));
  notify();
  return hit;
}

/** Ждёт изменения статусов не дольше timeoutMs (вызовы MCP не должны висеть долго). */
export function waitForChange(timeoutMs: number): Promise<void> {
  if (!isBusy()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(onChange);
      resolve();
    };
    const onChange = () => {
      if (!isBusy()) done();
    };
    const timer = setTimeout(done, timeoutMs);
    listeners.add(onChange);
  });
}
