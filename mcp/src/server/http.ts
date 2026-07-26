import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadEnv, type EnvConfig } from "../config/env.js";
import { GmcApiClient } from "../clients/gmc-api-client.js";
import { createBearerAuthMiddleware } from "../middleware/express-auth.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./create-mcp-server.js";
import { AppError } from "../errors.js";
import { log, truncateId } from "../logging.js";

type SessionContext = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
  lastActivityAt: number;
};

export type HttpAppOptions = {
  config?: EnvConfig;
  client?: GmcApiClient;
};

export function createHttpApp(options: HttpAppOptions = {}): {
  app: Express;
  config: EnvConfig;
  sessions: Map<string, SessionContext>;
  closeAllSessions: () => Promise<void>;
} {
  const config = options.config ?? loadEnv();
  const client =
    options.client ??
    new GmcApiClient({
      baseUrl: config.gmcApiUrl,
      apiKey: config.gmcApiKey,
      timeoutMs: config.requestTimeoutMs,
    });

  const sessions = new Map<string, SessionContext>();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(
    express.json({
      limit: config.bodyLimitBytes,
      type: ["application/json", "application/*+json"],
    })
  );

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    // Remote MCP is typically called server-to-server; keep CORS off by default.
    res.removeHeader("Access-Control-Allow-Origin");
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "gmc-mcp",
      version: MCP_SERVER_VERSION,
    });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({
      status: "ready",
      service: MCP_SERVER_NAME,
      hasAuth: Boolean(config.mcpAuthToken),
      gmcConfigured: Boolean(config.gmcApiUrl && config.gmcApiKey),
    });
  });

  const auth = createBearerAuthMiddleware(config.mcpAuthToken);
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      jsonrpc: "2.0",
      error: { code: -32029, message: "Too many requests" },
      id: null,
    },
  });

  function touchSession(sessionId: string) {
    const ctx = sessions.get(sessionId);
    if (ctx) ctx.lastActivityAt = Date.now();
  }

  function pruneSessions() {
    const now = Date.now();
    for (const [id, ctx] of sessions) {
      if (now - ctx.lastActivityAt > config.sessionTtlMs) {
        sessions.delete(id);
        void ctx.transport.close().catch(() => undefined);
        log("info", "mcp_session_expired", { sessionId: truncateId(id) });
      }
    }
  }

  setInterval(pruneSessions, Math.min(60_000, config.sessionTtlMs)).unref?.();

  async function createSession(
    req: Request,
    res: Response
  ): Promise<SessionContext | null> {
    pruneSessions();
    if (sessions.size >= config.maxSessions) {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32029, message: "Too many active MCP sessions" },
        id: null,
      });
      return null;
    }

    const server = createMcpServer({ client });
    let sessionIdForClose: string | undefined;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sessionId) => {
        sessionIdForClose = sessionId;
        const ctx: SessionContext = {
          transport,
          server,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        };
        sessions.set(sessionId, ctx);
        log("info", "mcp_session_initialized", {
          requestId: req.requestId,
          sessionId: truncateId(sessionId),
        });
      },
    });

    transport.onclose = () => {
      const sid = sessionIdForClose ?? transport.sessionId;
      if (sid && sessions.has(sid)) {
        sessions.delete(sid);
        log("info", "mcp_session_closed", { sessionId: truncateId(sid) });
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return sessionIdForClose ? sessions.get(sessionIdForClose) ?? null : null;
  }

  const mcpPostHandler = async (req: Request, res: Response) => {
    const started = Date.now();
    const sessionIdHeader = req.header("mcp-session-id")?.trim();
    try {
      if (sessionIdHeader) {
        const ctx = sessions.get(sessionIdHeader);
        if (!ctx) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Unknown MCP session" },
            id: null,
          });
          return;
        }
        touchSession(sessionIdHeader);
        await ctx.transport.handleRequest(req, res, req.body);
        return;
      }

      if (isInitializeRequest(req.body)) {
        await createSession(req, res);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
    } catch (err) {
      log("error", "mcp_post_error", {
        requestId: req.requestId,
        sessionId: truncateId(sessionIdHeader),
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : "unknown",
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  const mcpGetHandler = async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id")?.trim();
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session ID" },
        id: null,
      });
      return;
    }
    touchSession(sessionId);
    const ctx = sessions.get(sessionId)!;
    await ctx.transport.handleRequest(req, res);
  };

  const mcpDeleteHandler = async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id")?.trim();
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session ID" },
        id: null,
      });
      return;
    }
    const ctx = sessions.get(sessionId)!;
    await ctx.transport.handleRequest(req, res);
  };

  app.post("/mcp", limiter, auth, mcpPostHandler);
  app.get("/mcp", limiter, auth, mcpGetHandler);
  app.delete("/mcp", limiter, auth, mcpDeleteHandler);

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
      return;
    }
    if (err instanceof AppError && err.status) {
      res.status(err.status).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: err.message },
        id: null,
      });
      return;
    }
    log("error", "unhandled_error", {
      requestId: req.requestId,
      error: err instanceof Error ? err.message : "unknown",
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  });

  async function closeAllSessions() {
    const entries = [...sessions.entries()];
    sessions.clear();
    await Promise.all(
      entries.map(async ([, ctx]) => {
        await ctx.transport.close().catch(() => undefined);
      })
    );
  }

  return { app, config, sessions, closeAllSessions };
}

export async function startHttpServer(
  options: HttpAppOptions = {}
): Promise<{ server: HttpServer; config: EnvConfig; close: () => Promise<void> }> {
  const { app, config, closeAllSessions } = createHttpApp(options);
  const server = await new Promise<HttpServer>((resolve, reject) => {
    const s = app.listen(config.port, config.host, () => resolve(s));
    s.on("error", reject);
  });

  log("info", "mcp_http_listening", {
    host: config.host,
    port: config.port,
    service: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  const close = async () => {
    await closeAllSessions();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { server, config, close };
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startHttpServer().catch((err) => {
    log("error", "mcp_http_failed_to_start", {
      error: err instanceof Error ? err.message : "unknown",
    });
    process.exit(1);
  });
}
