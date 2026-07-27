import type {
  BetaMCPToolset,
  BetaRequestMCPServerURLDefinition,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AgentMcpConnection {
  id: string;
  agent_id: string;
  name: string;
  server_url: string;
  auth_secret_ref: string | null;
  allowed_tools: string[] | null;
  enabled: boolean;
}

export async function loadAgentMcpConnections(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentMcpConnection[]> {
  const { data, error } = await supabase
    .from("agent_mcp_connections")
    .select("id, agent_id, name, server_url, auth_secret_ref, allowed_tools, enabled")
    .eq("agent_id", agentId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[mcp] load connections failed:", error.message);
    return [];
  }
  return (data ?? []) as AgentMcpConnection[];
}

/** Normalize user input to env:VAR_NAME (secrets are never stored in plaintext). */
export function normalizeMcpAuthSecretRef(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("env:")) {
    const key = trimmed.slice(4).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
    return `env:${key}`;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return `env:${trimmed}`;
  }

  return null;
}

function resolveAuthToken(ref: string | null): string | null {
  if (!ref?.trim()) return null;
  if (!ref.startsWith("env:")) return null;
  const key = ref.slice(4).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return process.env[key]?.trim() || null;
}

export function buildAnthropicMcpServers(
  connections: AgentMcpConnection[]
): BetaRequestMCPServerURLDefinition[] {
  // mcp-client-2025-11-20: connection details only — tool allowlists live on mcp_toolset.
  return connections.map((conn) => ({
    type: "url" as const,
    name: conn.name,
    url: conn.server_url,
    authorization_token: resolveAuthToken(conn.auth_secret_ref),
  }));
}

/**
 * Every mcp_servers entry must be referenced by exactly one mcp_toolset in tools
 * (Anthropic rejects otherwise: "defined but not referenced by any mcp_toolset").
 */
export function buildAnthropicMcpToolsets(
  connections: AgentMcpConnection[]
): BetaMCPToolset[] {
  return connections.map((conn) => {
    if (conn.allowed_tools?.length) {
      return {
        type: "mcp_toolset" as const,
        mcp_server_name: conn.name,
        default_config: { enabled: false },
        configs: Object.fromEntries(
          conn.allowed_tools.map((toolName) => [toolName, { enabled: true }])
        ),
      };
    }
    return {
      type: "mcp_toolset" as const,
      mcp_server_name: conn.name,
    };
  });
}

/** Build toolsets from server defs already prepared for the API (all tools enabled). */
export function mcpToolsetsForServers(
  servers: BetaRequestMCPServerURLDefinition[]
): BetaMCPToolset[] {
  return servers.map((server) => ({
    type: "mcp_toolset" as const,
    mcp_server_name: server.name,
  }));
}

export const MCP_BETA = "mcp-client-2025-11-20" as const;
