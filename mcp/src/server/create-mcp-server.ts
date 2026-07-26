import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as McpServerCtor } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GmcApiClient } from "../clients/gmc-api-client.js";
import { registerGmcTools } from "../tools/index.js";

export const MCP_SERVER_NAME = "gmc-platform";
export const MCP_SERVER_VERSION = "1.0.0";

export type ServerDependencies = {
  client: GmcApiClient;
};

/** Create an isolated MCP server instance with all GMC tools registered. */
export function createMcpServer(dependencies: ServerDependencies): McpServer {
  const server = new McpServerCtor({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  registerGmcTools(server, dependencies.client);
  return server;
}
