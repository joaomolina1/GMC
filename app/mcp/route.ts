import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { GmcApiClient } from "../../mcp/src/clients/gmc-api-client";
import { createMcpServer, MCP_SERVER_VERSION } from "../../mcp/src/server/create-mcp-server";
import { authenticateMcpBearerToken } from "@lib/enterprise/mcp-key-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

function resolveGmcApiUrl(req: Request): string {
  const configured =
    process.env.GMC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (configured) return configured.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return new URL(req.url).origin;
}

function unauthorized(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    },
    { status: 401 }
  );
}

function misconfigured(message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32002, message },
      id: null,
    },
    { status: 503 }
  );
}

async function handleMcp(req: Request): Promise<Response> {
  const auth = await authenticateMcpBearerToken(
    req.headers.get("authorization"),
    process.env.MCP_AUTH_TOKEN
  );
  if (!auth) {
    return unauthorized();
  }

  const apiKey =
    (auth.kind === "db" ? auth.apiKeySecret : null) ||
    process.env.GMC_API_KEY?.trim() ||
    null;

  if (!apiKey) {
    return misconfigured(
      auth.kind === "db"
        ? "Esta chave MCP não tem API key ligada. Crie uma nova chave MCP no Admin → API."
        : "GMC_API_KEY is not configured on the server"
    );
  }

  const client = new GmcApiClient({
    baseUrl: resolveGmcApiUrl(req),
    apiKey,
    timeoutMs: Number(process.env.GMC_REQUEST_TIMEOUT_MS ?? 120_000),
  });

  // Stateless mode: fresh server+transport per request (required on Vercel serverless).
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer({ client });
  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function POST(req: Request) {
  return handleMcp(req);
}

export async function GET(req: Request) {
  return handleMcp(req);
}

export async function DELETE(req: Request) {
  return handleMcp(req);
}

/** Lightweight discovery for ops dashboards (not MCP protocol). */
export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "x-gmc-mcp-version": MCP_SERVER_VERSION },
  });
}
