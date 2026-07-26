import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";
import { authenticateV1Request } from "@lib/enterprise/v1-helpers";

export const runtime = "nodejs";

/** List agents owned by the API key user. */
export async function GET(request: Request) {
  const auth = await authenticateV1Request(request, "agents:read");
  if (!auth.ok) return auth.response;

  let query = auth.supabase
    .from("agents")
    .select(
      "id, name, description, status, visibility, category, tags, current_version_id, updated_at, created_at"
    )
    .eq("owner_id", auth.ctx.userId)
    .order("updated_at", { ascending: false });

  if (auth.ctx.allowedAgentIds?.length) {
    query = query.in("id", auth.ctx.allowedAgentIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** Create a new agent (+ draft v1). */
export async function POST(request: Request) {
  const auth = await authenticateV1Request(request, "agents:write");
  if (!auth.ok) return auth.response;

  let body: {
    name?: string;
    description?: string;
    system_prompt?: string;
    skills?: string[];
    visibility?: string;
    category?: string;
    tags?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data: agent, error: agentError } = await auth.supabase
    .from("agents")
    .insert({
      owner_id: auth.ctx.userId,
      name: body.name?.trim() || "Novo Agente",
      description: body.description ?? "",
      visibility: body.visibility ?? "private",
      category: body.category ?? "geral",
      tags: body.tags ?? [],
      status: "draft",
    })
    .select()
    .single();

  if (agentError || !agent) {
    return NextResponse.json(
      { error: agentError?.message ?? "Falha ao criar agente" },
      { status: 500 }
    );
  }

  const skills = Array.isArray(body.skills) ? body.skills : [];

  const { data: version, error: versionError } = await auth.supabase
    .from("agent_versions")
    .insert({
      agent_id: agent.id,
      version: 1,
      system_prompt:
        body.system_prompt ?? "És um assistente útil do Grupo Media Capital.",
      model: DEFAULT_AGENT_MODEL,
      skills,
      tools: {},
      skill_package_ids: [],
      status: "draft",
      created_by: auth.ctx.userId,
    })
    .select()
    .single();

  if (versionError || !version) {
    await auth.supabase.from("agents").delete().eq("id", agent.id);
    return NextResponse.json(
      { error: versionError?.message ?? "Falha ao criar versão" },
      { status: 500 }
    );
  }

  await auth.supabase
    .from("agents")
    .update({ current_version_id: version.id })
    .eq("id", agent.id);

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "agent.create",
    entityType: "agent",
    entityId: agent.id,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId },
  });

  return NextResponse.json({
    ...agent,
    current_version_id: version.id,
    current_version: version,
  });
}
