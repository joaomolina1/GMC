/**
 * GMC Platform MCP Server — stdio transport
 *
 * Env:
 *   GMC_API_URL, GMC_API_KEY (required)
 *   MCP_AUTH_TOKEN (unused in stdio mode)
 */
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "../config/env.js";
import { GmcApiClient } from "../clients/gmc-api-client.js";
import { createMcpServer } from "./create-mcp-server.js";
import { log } from "../logging.js";

export async function startStdioServer() {
  const config = loadEnv(process.env, { transport: "stdio" });
  const client = new GmcApiClient({
    baseUrl: config.gmcApiUrl,
    apiKey: config.gmcApiKey,
    timeoutMs: config.requestTimeoutMs,
  });
  const server = createMcpServer({ client });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "mcp_stdio_ready", { mode: "stdio" });
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startStdioServer().catch((err) => {
    log("error", "mcp_stdio_failed_to_start", {
      error: err instanceof Error ? err.message : "unknown",
    });
    process.exit(1);
  });
}
