import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import {
  authenticateV1Request,
  requireOwnedAgent,
} from "@lib/enterprise/v1-helpers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const auth = await authenticateV1Request(request, "agents:read");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedAgent(
    auth.supabase,
    auth.ctx.userId,
    agentId,
    auth.ctx.allowedAgentIds
  );
  if (!owned.ok) {
    // Allow reading public published agents with read scope (orchestration discovery)
    const { data: pub } = await auth.supabase
      .from("agents")
      .select("*, agent_versions!agent_versions_agent_id_fkey(*)")
      .eq("id", agentId)
      .eq("visibility", "public")
      .eq("status", "published")
      .single();
    if (!pub) return owned.response;
    return NextResponse.json(pub);
  }

  const { data, error } = await auth.supabase
    .from("agents")
    .select("*, agent_versions!agent_versions_agent_id_fkey(*)")
    .eq("id", agentId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const auth = await authenticateV1Request(request, "agents:write");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedAgent(
    auth.supabase,
    auth.ctx.userId,
    agentId,
    auth.ctx.allowedAgentIds
  );
  if (!owned.ok) return owned.response;

  let body: {
    name?: string;
    description?: string;
    visibility?: string;
    category?: string;
    tags?: string[];
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if (body.category !== undefined) patch.category = body.category;
  if (body.tags !== undefined) patch.tags = body.tags;
  if (body.status !== undefined) patch.status = body.status;

  const { data, error } = await auth.supabase
    .from("agents")
    .update(patch)
    .eq("id", agentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "agent.update",
    entityType: "agent",
    entityId: agentId,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId },
  });

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const auth = await authenticateV1Request(request, "agents:write");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedAgent(
    auth.supabase,
    auth.ctx.userId,
    agentId,
    auth.ctx.allowedAgentIds
  );
  if (!owned.ok) return owned.response;

  const { error } = await auth.supabase.from("agents").delete().eq("id", agentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "agent.delete",
    entityType: "agent",
    entityId: agentId,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId },
  });

  return NextResponse.json({ success: true });
}
