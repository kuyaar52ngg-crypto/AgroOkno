// Локальная БД (expo-sqlite; на вебе — wasm) — зеркало пользовательских таблиц Supabase.
// Хранение документное: таблица docs(tbl, id, data JSON, pending, ...) + все документы в памяти,
// поэтому хуки читают синхронно и реагируют на изменения через шину. Если SQLite недоступна
// (например, веб без заголовков COOP/COEP), слой продолжает работать только в памяти.
// Очередь отправки — это документы с pending = 1 (новые/изменённые/мягко удалённые офлайн).
import * as SQLite from 'expo-sqlite';

import { emitChange } from './bus';

export type Row = Record<string, unknown> & { updated_at?: string; deleted_at?: string | null };

export interface Doc {
  tbl: string;
  id: string;
  data: Row;
  pending: boolean;
}

const DB_NAME = 'agrookno.db';

let db: SQLite.SQLiteDatabase | null = null;
let persistent = false;
let ready = false;
const tables = new Map<string, Map<string, Doc>>();
const meta = new Map<string, string>();
const dirtyDocs = new Map<string, Doc>();
const dirtyMeta = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> = Promise.resolve();

export const isReady = () => ready;
export const isPersistent = () => persistent;

function tableMap(tbl: string): Map<string, Doc> {
  let m = tables.get(tbl);
  if (!m) {
    m = new Map();
    tables.set(tbl, m);
  }
  return m;
}

export async function initStore(): Promise<void> {
  if (ready) return;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS docs (
        tbl TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        pending INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tbl, id)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    const docs = await db.getAllAsync<{ tbl: string; id: string; data: string; pending: number }>('SELECT tbl, id, data, pending FROM docs');
    for (const d of docs) {
      try {
        tableMap(d.tbl).set(d.id, { tbl: d.tbl, id: d.id, data: JSON.parse(d.data) as Row, pending: d.pending === 1 });
      } catch {
        // повреждённая запись — пропускаем
      }
    }
    const metas = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM meta');
    for (const m of metas) meta.set(m.key, m.value);
    persistent = true;
  } catch (e) {
    console.warn('[data] SQLite недоступна, работаем только в памяти:', e instanceof Error ? e.message : e);
    db = null;
    persistent = false;
  }
  ready = true;
  emitChange();
}

function scheduleFlush(): void {
  if (!persistent || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 150);
}

/** Записывает накопленные изменения в SQLite одной транзакцией. */
export function flush(): Promise<void> {
  flushing = flushing.then(async () => {
    if (!db || (dirtyDocs.size === 0 && dirtyMeta.size === 0)) return;
    const docs = [...dirtyDocs.values()];
    const metaKeys = [...dirtyMeta];
    dirtyDocs.clear();
    dirtyMeta.clear();
    try {
      await db.withTransactionAsync(async () => {
        for (const d of docs) {
          await db!.runAsync('INSERT OR REPLACE INTO docs (tbl, id, data, pending) VALUES (?, ?, ?, ?)', d.tbl, d.id, JSON.stringify(d.data), d.pending ? 1 : 0);
        }
        for (const k of metaKeys) {
          const value = meta.get(k);
          if (value === undefined) await db!.runAsync('DELETE FROM meta WHERE key = ?', k);
          else await db!.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', k, value);
        }
      });
    } catch (e) {
      console.warn('[data] не удалось записать в SQLite:', e instanceof Error ? e.message : e);
      for (const d of docs) dirtyDocs.set(`${d.tbl}:${d.id}`, d);
      for (const k of metaKeys) dirtyMeta.add(k);
    }
  });
  return flushing;
}

// ─── Чтение ─────────────────────────────────────────────────────────────────

export function getDoc(tbl: string, id: string): Doc | undefined {
  return tables.get(tbl)?.get(id);
}

/** Живые (не удалённые) строки таблицы. */
export function rows<T extends Row = Row>(tbl: string): T[] {
  const out: T[] = [];
  for (const d of tables.get(tbl)?.values() ?? []) if (!d.data.deleted_at) out.push(d.data as T);
  return out;
}

export function isPending(tbl: string, id: string): boolean {
  return getDoc(tbl, id)?.pending ?? false;
}

export function pendingDocs(): Doc[] {
  const out: Doc[] = [];
  for (const m of tables.values()) for (const d of m.values()) if (d.pending) out.push(d);
  return out;
}

export function pendingCount(): number {
  return pendingDocs().length;
}

export function hasAnyDocs(): boolean {
  for (const m of tables.values()) if (m.size > 0) return true;
  return false;
}

// ─── Запись ─────────────────────────────────────────────────────────────────

function setDoc(doc: Doc, silent = false): void {
  tableMap(doc.tbl).set(doc.id, doc);
  dirtyDocs.set(`${doc.tbl}:${doc.id}`, doc);
  scheduleFlush();
  if (!silent) emitChange();
}

/** Локальная запись пользователя: сразу видна экранам, отправится на сервер при синхронизации. */
export function putLocal(tbl: string, idKey: string, row: Row): void {
  const id = String(row[idKey]);
  setDoc({ tbl, id, data: row, pending: true });
}

/** Мягкое удаление: строка остаётся с deleted_at, чтобы удаление доехало до сервера. */
export function softDelete(tbl: string, id: string, at: string): void {
  const doc = getDoc(tbl, id);
  if (!doc) return;
  setDoc({ ...doc, data: { ...doc.data, deleted_at: at }, pending: true });
}

/** Серверные строки после pull/push: не затирают локальные несинхронизированные изменения. */
export function applyServerRows(tbl: string, idKey: string, serverRows: Row[], options: { force?: boolean } = {}): void {
  let changed = false;
  for (const row of serverRows) {
    const id = String(row[idKey]);
    const local = getDoc(tbl, id);
    if (local?.pending && !options.force) continue;
    setDoc({ tbl, id, data: row, pending: false }, true);
    changed = true;
  }
  if (changed) emitChange();
}

export function clearPending(tbl: string, id: string): void {
  const doc = getDoc(tbl, id);
  if (doc?.pending) setDoc({ ...doc, pending: false });
}

// ─── Метаданные ─────────────────────────────────────────────────────────────

export const getMeta = (key: string): string | undefined => meta.get(key);

export function setMeta(key: string, value: string | undefined): void {
  if (value === undefined) meta.delete(key);
  else meta.set(key, value);
  dirtyMeta.add(key);
  scheduleFlush();
}

/** Полная очистка локальных данных (смена пользователя). */
export async function wipeStore(): Promise<void> {
  tables.clear();
  meta.clear();
  dirtyDocs.clear();
  dirtyMeta.clear();
  if (db) {
    try {
      await db.execAsync('DELETE FROM docs; DELETE FROM meta;');
    } catch {
      // игнорируем: память уже очищена
    }
  }
  emitChange();
}
