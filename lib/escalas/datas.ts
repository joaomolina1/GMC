/** Datas como strings YYYY-MM-DD, calculadas ao meio-dia UTC (sem surpresas de fuso/hora de verão). */

export const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const parseD = (s: string) => new Date(s + "T12:00:00Z");

export function addDays(s: string, n: number): string {
  const d = parseD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

/** 0 = segunda … 6 = domingo. */
export const dow = (s: string) => (parseD(s).getUTCDay() + 6) % 7;
export const mondayOf = (s: string) => addDays(s, -dow(s));
export const isWE = (s: string) => dow(s) >= 5;

/** Hoje em Lisboa. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dRange(a: string, b: string, max = 1500): string[] {
  const o: string[] = [];
  if (!a || !b) return o;
  for (let d = a, i = 0; d <= b && i < max; d = addDays(d, 1), i++) o.push(d);
  return o;
}

export const daysBetween = (a: string, b: string) => Math.round((parseD(b).getTime() - parseD(a).getTime()) / 864e5);

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const fmt = (s: string) => {
  const d = parseD(s);
  return d.getUTCDate() + " " + MESES[d.getUTCMonth()];
};
export const fmtFull = (s: string) => DIAS[dow(s)] + ", " + fmt(s);
export const fmtDMY = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export function isoWeek(s: string): number {
  const d = parseD(s);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - y.getTime()) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
}

export const minToHM = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return pad(Math.floor(x / 60)) + ":" + pad(x % 60);
};

export function hmToMin(v: unknown): number {
  if (typeof v === "number") return v < 1.0001 ? Math.round(v * 1440) : Math.round(v);
  const m = String(v ?? "").trim().match(/^(\d{1,2})\s*[:hH.]?\s*(\d{2})?/);
  if (!m) return NaN;
  return +m[1] * 60 + +(m[2] || 0);
}

export const isISODate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseD(s).getTime());

export function lastDayOfMonth(s: string): string {
  const d = parseD(s);
  return isoOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
}
