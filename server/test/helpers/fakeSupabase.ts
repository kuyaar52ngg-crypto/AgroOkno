// Минимальная in-memory имитация PostgREST-клиента для тестов (select/insert/upsert/update/delete + фильтры).
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Исключение RPC-обработчика → { data: null, error } (как raise exception в Postgres). */
export class RpcError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const UNIQUE: Record<string, string[]> = { reminder_log: ['farm_id', 'form_code', 'period', 'kind'], farm_members: ['farm_id', 'user_id'] };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: Row) => unknown> = {};
  calls: { table: string; op: string; payload?: unknown }[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  client(): SupabaseClient {
    const db = this;
    return {
      from: (table: string) => new Query(db, table),
      rpc: async (fn: string, args: Row = {}) => {
        db.calls.push({ table: `rpc:${fn}`, op: 'rpc', payload: args });
        const h = db.rpcs[fn];
        try {
          return { data: h ? h(args) : null, error: null };
        } catch (e) {
          if (e instanceof RpcError) return { data: null, error: { code: e.code, message: e.message } };
          throw e;
        }
      },
    } as unknown as SupabaseClient;
  }
}

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'insert' | 'delete' | 'upsert' | 'update' = 'select';
  private patch: Row = {};
  private payload: Row[] = [];
  private lim: number | null = null;
  private rangeFrom = 0;
  private rangeTo = Infinity;
  private single = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v));
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => String(r[col]) >= String(v));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run(): Result {
    const rows = this.db.rows(this.table);
    this.db.calls.push({ table: this.table, op: this.op, payload: this.payload });
    if (this.op === 'insert' || this.op === 'upsert') {
      const keys = UNIQUE[this.table];
      for (const p of this.payload) {
        if (keys && rows.some((r) => keys.every((k) => r[k] === p[k]))) {
          if (this.op === 'upsert') continue;
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        rows.push({ ...p });
      }
      return { data: this.payload, error: null };
    }
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !matched.includes(r));
      return { data: matched, error: null };
    }
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.patch);
      return { data: matched, error: null };
    }
    let out = matched.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.lim !== null) out = out.slice(0, this.lim);
    return { data: this.single ? (out[0] ?? null) : out, error: null };
  }

  then<R1 = Result, R2 = never>(onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}
