import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { normalizeMcpAuthSecretRef } from "@lib/agents/mcp-connections";
import { isAllowedOutboundUrl } from "@lib/security/url-policy";

async function assertAgentAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  userId: string
) {
  const { data: agent } = await supabase
    .from("agents")
    .select("id, owner_id")
    .eq("id", agentId)
    .single();

  if (!agent) return { error: NextResponse.json({ error: "Agente não encontrado" }, { status: 404 }) };
  if (agent.owner_id === userId) return { agent };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { agent };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertAgentAccess(supabase, agentId, user.id);
  if (access.error) return access.error;

  const { data, error } = await supabase
    .from("agent_mcp_connections")
    .select("id, name, server_url, allowed_tools, enabled, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertAgentAccess(supabase, agentId, user.id);
  if (access.error) return access.error;

  const body = await request.json();
  const { name, server_url, auth_secret_ref, allowed_tools, enabled } = body as {
    name?: string;
    server_url?: string;
    auth_secret_ref?: string;
    allowed_tools?: string[];
    enabled?: boolean;
  };

  if (!name?.trim() || !server_url?.trim()) {
    return NextResponse.json({ error: "name e server_url são obrigatórios" }, { status: 400 });
  }

  if (!isAllowedOutboundUrl(server_url.trim())) {
    return NextResponse.json(
      { error: "URL inválida ou endereço interno não permitido" },
      { status: 400 }
    );
  }

  const normalizedAuthRef = normalizeMcpAuthSecretRef(auth_secret_ref);
  if (auth_secret_ref?.trim() && !normalizedAuthRef) {
    return NextResponse.json(
      {
        error:
          "Token inválido — use env:NOME_VAR ou apenas o nome da variável de ambiente (ex. MCP_GMAIL_TOKEN)",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("agent_mcp_connections")
    .insert({
      agent_id: agentId,
      name: name.trim().replace(/\s+/g, "_").toLowerCase(),
      server_url: server_url.trim(),
      auth_secret_ref: normalizedAuthRef,
      allowed_tools: allowed_tools?.length ? allowed_tools : null,
      enabled: enabled !== false,
      created_by: user.id,
    })
    .select("id, name, server_url, allowed_tools, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertAgentAccess(supabase, agentId, user.id);
  if (access.error) return access.error;

  const body = await request.json();
  const { id, enabled, allowed_tools, auth_secret_ref } = body as {
    id?: string;
    enabled?: boolean;
    allowed_tools?: string[];
    auth_secret_ref?: string;
  };

  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (allowed_tools !== undefined) updates.allowed_tools = allowed_tools;
  if (auth_secret_ref !== undefined) {
    const normalizedAuthRef = normalizeMcpAuthSecretRef(auth_secret_ref);
    if (auth_secret_ref?.trim() && !normalizedAuthRef) {
      return NextResponse.json(
        { error: "Token inválido — use env:NOME_VAR ou apenas o nome da variável" },
        { status: 400 }
      );
    }
    updates.auth_secret_ref = normalizedAuthRef;
  }

  const { data, error } = await supabase
    .from("agent_mcp_connections")
    .update(updates)
    .eq("id", id)
    .eq("agent_id", agentId)
    .select("id, name, server_url, allowed_tools, enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertAgentAccess(supabase, agentId, user.id);
  if (access.error) return access.error;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("id");
  if (!connectionId) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("agent_mcp_connections")
    .delete()
    .eq("id", connectionId)
    .eq("agent_id", agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
