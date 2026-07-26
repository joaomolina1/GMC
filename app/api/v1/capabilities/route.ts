import { NextResponse } from "next/server";
import { authenticatePlatformApiKey } from "@lib/enterprise/api-key-auth";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";
import { PLATFORM_API_SCOPES, scopeImplies } from "@lib/enterprise/platform-scopes";

export const runtime = "nodejs";

/** Discovery endpoint for MCP / external orchestrators. */
export async function GET(request: Request) {
  const auth = await authenticatePlatformApiKey(request);
  if (!auth.ok) return auth.response;

  const canDiscover =
    scopeImplies(auth.ctx.scopes, "agents:read") ||
    scopeImplies(auth.ctx.scopes, "flows:read") ||
    scopeImplies(auth.ctx.scopes, "agents:run") ||
    scopeImplies(auth.ctx.scopes, "flows:run");

  if (!canDiscover) {
    return NextResponse.json(
      { error: "Scope em falta: agents:read ou flows:read" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    platform: "GMC Agent Platform",
    version: "1",
    scopes_available: PLATFORM_API_SCOPES,
    key_scopes: auth.ctx.scopes,
    agent_tools: [
      "web_search",
      "create_documents",
      "read_document",
      "vision",
      "knowledge_search",
      "http_request",
      "fetch_url",
    ],
    flow_node_types: FLOW_NODE_TYPES.map((n) => ({
      type: n.type,
      label: n.label,
      description: n.desc,
      default_data: n.defaultData,
    })),
    endpoints: {
      agents: "/api/v1/agents",
      agent: "/api/v1/agents/{id}",
      agent_versions: "/api/v1/agents/{id}/versions",
      agent_run: "/api/v1/agents/{id}/run",
      flows: "/api/v1/flows",
      flow: "/api/v1/flows/{id}",
      flow_run: "/api/v1/flows/{id}/run",
      flow_run_status: "/api/v1/flows/{id}/runs/{runId}",
    },
  });
}
