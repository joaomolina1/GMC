/**
 * Supabase em memória para os testes do worker. Suporta o subconjunto de PostgREST que
 * os passos usam: from().select/insert/update/delete com eq/in/gt/lt/gte/lte/order/range/limit,
 * maybeSingle/single, head+count, e rpc() via handlers registados.
 */
import type { ServiceClient } from "../../src/supabase";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  rpcs: Record<string, (params: Record<string, unknown>) => unknown>;
  client: ServiceClient;
  storage: FakeStorage;
}

export interface FakeStorage {
  objects: Map<string, { data: Buffer; contentType: string }>;
}

let idCounter = 0;
export function fakeId(prefix = "id"): string {
  idCounter++;
  return `${prefix}-${String(idCounter).padStart(4, "0")}`;
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: null | { message: string }; count?: number | null }> {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean }[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private wantSingle = false;
  private wantMaybe = false;
  private head = false;
  private countMode = false;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;

  constructor(private readonly db: FakeDb, private readonly table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.head = Boolean(opts?.head);
      this.countMode = Boolean(opts?.count);
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  gt(col: string, val: number) {
    this.filters.push((r) => Number(r[col]) > val);
    return this;
  }
  lt(col: string, val: number) {
    this.filters.push((r) => Number(r[col]) < val);
    return this;
  }
  gte(col: string, val: number) {
    this.filters.push((r) => Number(r[col]) >= val);
    return this;
  }
  lte(col: string, val: number) {
    this.filters.push((r) => Number(r[col]) <= val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.wantMaybe = true;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  private rows(): Row[] {
    const all = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    let out = all.filter((r) => this.filters.every((f) => f(r)));
    for (const o of [...this.orderBy].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[o.col] as number | string;
        const y = b[o.col] as number | string;
        if (x === y) return 0;
        return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }

  private execute() {
    const table = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    let result: Row[] = [];
    if (this.op === "select") {
      result = this.rows();
      if (this.head) return { data: null, error: null, count: result.length };
    } else if (this.op === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      result = rows.map((r) => ({ id: fakeId(this.table), created_at: new Date().toISOString(), ...r }));
      table.push(...result);
    } else if (this.op === "update") {
      result = this.rows();
      for (const r of result) Object.assign(r, this.payload as Row, { updated_at: new Date().toISOString() });
    } else if (this.op === "delete") {
      result = this.rows();
      const ids = new Set(result);
      this.db.tables[this.table] = table.filter((r) => !ids.has(r));
    }
    const data = this.op !== "select" && !this.returning ? null : result;
    if (this.wantSingle || this.wantMaybe) {
      const row = result[0] ?? null;
      if (this.wantSingle && !row) return { data: null, error: { message: "Row not found" } };
      return { data: row, error: null };
    }
    return { data, error: null, count: this.countMode ? result.length : null };
  }

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null | { message: string }; count?: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const storage: FakeStorage = { objects: new Map() };
  const db: FakeDb = {
    tables: { ...seed },
    rpcs: {},
    storage,
    client: null as unknown as ServiceClient,
  };
  const client = {
    from(table: string) {
      return new QueryBuilder(db, table);
    },
    async rpc(name: string, params: Record<string, unknown>) {
      const fn = db.rpcs[name];
      if (!fn) return { data: null, error: { message: `rpc ${name} não registada` } };
      try {
        return { data: await fn(params), error: null };
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
      }
    },
  };
  db.client = client as unknown as ServiceClient;
  return db;
}
