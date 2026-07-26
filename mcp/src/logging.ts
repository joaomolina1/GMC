export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    if (/gmc_live_|Bearer\s+/i.test(value)) return "[redacted]";
    if (value.length > 500) return `${value.slice(0, 500)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|api[_-]?key|token|secret|cookie|password/i.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

export function truncateId(id: string | undefined | null, keep = 8): string | undefined {
  if (!id) return undefined;
  if (id.length <= keep) return id;
  return `${id.slice(0, keep)}…`;
}

export function log(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
  stream: "stdout" | "stderr" = "stderr"
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...((sanitize(fields) as LogFields) ?? {}),
  });
  if (stream === "stdout") {
    console.log(line);
  } else {
    console.error(line);
  }
}
