import type { SkillDefinition } from "../types";
import { validateOutboundUrl } from "./security";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256_000;

export const httpRequestSkill: SkillDefinition = {
  key: "http_request",
  name: "HTTP Request",
  description:
    "Make HTTP requests to external APIs. Use for fetching data from REST endpoints, webhooks, or third-party services. Only GET/POST/PUT/PATCH/DELETE on public URLs.",
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        description: "HTTP method (default GET)",
      },
      url: { type: "string", description: "Full URL to request" },
      headers: {
        type: "object",
        description: "Optional HTTP headers as key-value pairs",
      },
      body: { type: "string", description: "Optional request body (JSON string or plain text)" },
    },
    required: ["url"],
  },
  async execute(params, ctx) {
    const method = String(params.method ?? "GET").toUpperCase();
    const url = String(params.url);
    const headers = (params.headers as Record<string, string>) ?? {};
    const body = params.body != null ? String(params.body) : undefined;

    const config = ctx.skillConfigs?.http_request ?? {};
    const allowedHosts = config.allowed_hosts as string[] | undefined;
    const timeoutMs = Number(config.timeout_ms ?? DEFAULT_TIMEOUT_MS);

    validateOutboundUrl(url, allowedHosts);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent": "GMC-Agent/1.0",
          Accept: "application/json, text/plain, */*",
          ...headers,
        },
        body: ["GET", "HEAD"].includes(method) ? undefined : body,
        signal: controller.signal,
      });

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        return `HTTP ${res.status}: Response too large (${buffer.byteLength} bytes, max ${MAX_RESPONSE_BYTES})`;
      }

      const text = new TextDecoder().decode(buffer);
      const contentType = res.headers.get("content-type") ?? "";

      let bodyPreview = text;
      if (contentType.includes("application/json")) {
        try {
          bodyPreview = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* keep raw */
        }
      }

      return [
        `HTTP ${res.status} ${res.statusText}`,
        `URL: ${url}`,
        `Content-Type: ${contentType || "unknown"}`,
        "",
        bodyPreview.slice(0, 8000),
      ].join("\n");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return `HTTP request timed out after ${timeoutMs}ms`;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },
};
