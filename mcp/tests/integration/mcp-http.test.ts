import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHttpApp } from "../../src/server/http.js";
import { GmcApiClient } from "../../src/clients/gmc-api-client.js";
import { loadEnv } from "../../src/config/env.js";
import { createMcpServer } from "../../src/server/create-mcp-server.js";

const TOKEN = "test-mcp-token";

const mockClient = new GmcApiClient({
  baseUrl: "https://example.test",
  apiKey: "gmc_live_test",
  fetchImpl: vi.fn(async (url: string | URL) => {
    const path = String(url);
    if (path.endsWith("/api/v1/capabilities")) {
      return new Response(
        JSON.stringify({
          platform: "GMC Agent Platform",
          version: "1",
          scopes_available: [],
          key_scopes: [],
          agent_tools: [],
          flow_node_types: [],
          endpoints: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path.endsWith("/api/v1/agents")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }) as unknown as typeof fetch,
});

describe("MCP HTTP integration", () => {
  const config = loadEnv({
    GMC_API_URL: "https://example.test",
    GMC_API_KEY: "gmc_live_test",
    MCP_AUTH_TOKEN: TOKEN,
    PORT: "3011",
    NODE_ENV: "test",
  });

  const { app, closeAllSessions } = createHttpApp({ config, client: mockClient });

  afterAll(async () => {
    await closeAllSessions();
  });

  it("GET /health returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("gmc-mcp");
  });

  it("rejects /mcp without auth", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });
    expect(res.status).toBe(401);
  });

  it("rejects /mcp with invalid token", async () => {
    const res = await request(app)
      .post("/mcp")
      .set("Authorization", "Bearer wrong")
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });
    expect(res.status).toBe(401);
  });

  it("initialize + tools/list + tools/call", async () => {
    const init = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

    expect(init.status).toBe(200);
    const sessionId = init.headers["mcp-session-id"];
    expect(sessionId).toBeTruthy();
    expect(JSON.stringify(init.body)).not.toContain("gmc_live_test");
    expect(JSON.stringify(init.body)).not.toContain(TOKEN);

    await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("mcp-session-id", String(sessionId))
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

    const list = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("mcp-session-id", String(sessionId))
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

    expect(list.status).toBe(200);
    const tools = list.body?.result?.tools ?? [];
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_platform_capabilities");
    expect(names).toContain("list_agents");
    expect(names).toContain("run_flow");
    expect(names.length).toBeGreaterThanOrEqual(17);

    const call = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("mcp-session-id", String(sessionId))
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_platform_capabilities", arguments: {} },
      });

    expect(call.status).toBe(200);
    const text = call.body?.result?.content?.[0]?.text ?? "";
    expect(text).toContain("GMC Agent Platform");
    expect(text).not.toContain("gmc_live_test");
    expect(text).not.toContain(TOKEN);

    const badSession = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("mcp-session-id", "00000000-0000-0000-0000-000000000000")
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json")
      .send({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      });
    expect(badSession.status).toBe(404);

    const del = await request(app)
      .delete("/mcp")
      .set("Authorization", `Bearer ${TOKEN}`)
      .set("mcp-session-id", String(sessionId));
    expect([200, 204]).toContain(del.status);
  });

  it("createMcpServer registers tools without transport", () => {
    const server = createMcpServer({ client: mockClient });
    const tools = (server as unknown as { _registeredTools?: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(tools ?? {})).toContain("list_agents");
  });
});
