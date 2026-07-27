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

export function mcpAuthEnvName(ref: string | null | undefined): string | null {
  if (!ref?.startsWith("env:")) return null;
  const key = ref.slice(4).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : null;
}

/** Thrown when an agent MCP connector references an env var that is unset on the server. */
export class McpAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthConfigError";
  }
}

export function buildAnthropicMcpServers(
  connections: AgentMcpConnection[]
): BetaRequestMCPServerURLDefinition[] {
  // mcp-client-2025-11-20: connection details only — tool allowlists live on mcp_toolset.
  return connections.map((conn) => {
    const authorization_token = resolveAuthToken(conn.auth_secret_ref);
    if (conn.auth_secret_ref && !authorization_token) {
      const envName = mcpAuthEnvName(conn.auth_secret_ref) ?? conn.auth_secret_ref;
      throw new McpAuthConfigError(
        `O conector MCP "${conn.name}" usa a variável ${envName}, mas ela não está definida no servidor (Vercel). ` +
          `Em Vercel → Settings → Environment Variables, crie ${envName} com o valor da chave MCP (mcp_...) ` +
          `e faça redeploy. Sem isto a Anthropic não consegue autenticar no /mcp.`
      );
    }
    return {
      type: "url" as const,
      name: conn.name,
      url: conn.server_url,
      authorization_token,
    };
  });
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
