#!/usr/bin/env node
/**
 * GMC Platform MCP Server
 *
 * Exposes tools for an LLM to create, modify, orchestrate and run
 * agents and flows on the GMC platform via the /api/v1 HTTP API.
 *
 * Env:
 *   GMC_API_URL  — e.g. https://gmcprototypes.vercel.app
 *   GMC_API_KEY  — gmc_live_... platform API key
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GmcApiClient } from "./client.js";
import { registerGmcTools } from "./tools.js";

const baseUrl = process.env.GMC_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const apiKey = process.env.GMC_API_KEY ?? "";

if (!baseUrl || !apiKey) {
  console.error(
    "[gmc-mcp] Missing GMC_API_URL and/or GMC_API_KEY. Set them in the MCP server env."
  );
  process.exit(1);
}

const client = new GmcApiClient(baseUrl, apiKey);
const server = new McpServer({
  name: "gmc-platform",
  version: "1.0.0",
});

registerGmcTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
