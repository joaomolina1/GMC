const EPOCH = Date.UTC(1970, 0, 1);

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Data inválida: ${iso}`);
  return { y, m, d };
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysSinceEpoch(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
}

/** Segunda-feira da semana ISO que contém `iso` (calendário civil, sem fuso). */
export function weekStart(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, delta);
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayInLisbon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 04/10 — o formato usado nas mensagens de folgas. */
export function formatDayMonth(iso: string): string {
  const { m, d } = parseISODate(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function formatLongDate(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatWeekdayShort(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return new Intl.DateTimeFormat("pt-PT", { weekday: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
}

export function formatRange(from: string, to: string): string {
  const a = parseISODate(from);
  const b = parseISODate(to);
  const left = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(a.y, a.m - 1, a.d))
  );
  const right = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(b.y, b.m - 1, b.d)));
  return `${left} – ${right}`;
}
