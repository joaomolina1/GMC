export type LogLevel = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    if (/Bearer\s+|sk-ant-|hf_[A-Za-z0-9]{10,}/i.test(value)) return "[redacted]";
    return value.length > 800 ? `${value.slice(0, 800)}…[truncated]` : value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value as Fields)) {
      out[k] = /authorization|api[_-]?key|token|secret|password/i.test(k) ? "[redacted]" : sanitize(v);
    }
    return out;
  }
  return value;
}

const MIN_LEVEL: Record<LogLevel | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const configured = (process.env.LOG_LEVEL?.trim().toLowerCase() as LogLevel | "silent") || "info";

export function log(level: LogLevel, message: string, fields: Fields = {}) {
  if (MIN_LEVEL[level] < (MIN_LEVEL[configured] ?? 20)) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...((sanitize(fields) as Fields) ?? {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}
