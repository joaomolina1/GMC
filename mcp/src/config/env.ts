export type EnvConfig = {
  gmcApiUrl: string;
  gmcApiKey: string;
  mcpAuthToken: string | null;
  port: number;
  nodeEnv: "development" | "production" | "test";
  host: string;
  requestTimeoutMs: number;
  sessionTtlMs: number;
  maxSessions: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  bodyLimitBytes: number;
};

export class ConfigError extends Error {
  readonly code = "CONFIG_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requireString(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return trimmed;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError("PORT must be an integer between 1 and 65535");
  }
  return value;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive number`);
  }
  return Math.floor(value);
}

export function loadEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { transport?: "http" | "stdio" } = {}
): EnvConfig {
  const nodeEnvRaw = (env.NODE_ENV ?? "development").trim();
  const nodeEnv =
    nodeEnvRaw === "production" || nodeEnvRaw === "test" || nodeEnvRaw === "development"
      ? nodeEnvRaw
      : "development";

  const transport = options.transport ?? "http";

  const gmcApiUrl = requireString("GMC_API_URL", env.GMC_API_URL);
  try {
    const url = new URL(gmcApiUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new ConfigError("GMC_API_URL must be a valid http(s) URL");
  }

  const gmcApiKey = requireString("GMC_API_KEY", env.GMC_API_KEY);

  const authTokenRaw = env.MCP_AUTH_TOKEN?.trim() ?? "";
  if (transport === "http") {
    if (!authTokenRaw && nodeEnv === "production") {
      throw new ConfigError("MCP_AUTH_TOKEN is required in production");
    }
    if (!authTokenRaw && nodeEnv !== "test") {
      throw new ConfigError("MCP_AUTH_TOKEN is required (optional only when NODE_ENV=test)");
    }
  }

  return {
    gmcApiUrl: gmcApiUrl.replace(/\/$/, ""),
    gmcApiKey,
    mcpAuthToken: authTokenRaw || null,
    port: parsePort(env.PORT, 3000),
    nodeEnv,
    host: (env.HOST?.trim() || "0.0.0.0").trim(),
    requestTimeoutMs: parsePositiveInt("GMC_REQUEST_TIMEOUT_MS", env.GMC_REQUEST_TIMEOUT_MS, 120_000),
    sessionTtlMs: parsePositiveInt("MCP_SESSION_TTL_MS", env.MCP_SESSION_TTL_MS, 30 * 60_000),
    maxSessions: parsePositiveInt("MCP_MAX_SESSIONS", env.MCP_MAX_SESSIONS, 200),
    rateLimitWindowMs: parsePositiveInt("MCP_RATE_LIMIT_WINDOW_MS", env.MCP_RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: parsePositiveInt("MCP_RATE_LIMIT_MAX", env.MCP_RATE_LIMIT_MAX, 120),
    bodyLimitBytes: parsePositiveInt("MCP_BODY_LIMIT_BYTES", env.MCP_BODY_LIMIT_BYTES, 1_048_576),
  };
}
