import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";
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
  if (!owned.ok) return owned.response;

  const { data, error } = await auth.supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * Update current version in-place, or create a new snapshot with createSnapshot=true.
 * Also publishes the agent (status=published) so it becomes runnable via API.
 */
export async function POST(
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
    system_prompt?: string;
    skills?: string[];
    tools?: Record<string, unknown>;
    skill_package_ids?: string[];
    effort?: string;
    thinking_enabled?: boolean;
    max_steps?: number;
    createSnapshot?: boolean;
    publish?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const agent = owned.agent as {
    id: string;
    current_version_id: string | null;
  };

  const { data: currentVersion } = agent.current_version_id
    ? await auth.supabase
        .from("agent_versions")
        .select("*")
        .eq("id", agent.current_version_id)
        .single()
    : { data: null };

  const versionPayload = {
    system_prompt: body.system_prompt ?? currentVersion?.system_prompt ?? "",
    model: currentVersion?.model ?? DEFAULT_AGENT_MODEL,
    temperature: currentVersion?.temperature ?? 0.7,
    effort: body.effort ?? currentVersion?.effort ?? "low",
    thinking_enabled: body.thinking_enabled ?? currentVersion?.thinking_enabled ?? false,
    skills: body.skills ?? currentVersion?.skills ?? [],
    tools: body.tools ?? currentVersion?.tools ?? {},
    skill_package_ids: body.skill_package_ids ?? currentVersion?.skill_package_ids ?? [],
    max_steps: body.max_steps ?? currentVersion?.max_steps ?? 12,
  };

  const createSnapshot = Boolean(body.createSnapshot) || !agent.current_version_id;
  let version;

  if (!createSnapshot && agent.current_version_id) {
    const { data, error } = await auth.supabase
      .from("agent_versions")
      .update(versionPayload)
      .eq("id", agent.current_version_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    version = data;
  } else {
    const { data: latest } = await auth.supabase
      .from("agent_versions")
      .select("version")
      .eq("agent_id", agentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    await auth.supabase
      .from("agent_versions")
      .update({ status: "archived" })
      .eq("agent_id", agentId)
      .eq("status", "published");

    const { data, error } = await auth.supabase
      .from("agent_versions")
      .insert({
        agent_id: agentId,
        version: (latest?.version ?? 0) + 1,
        ...versionPayload,
        status: "published",
        published_at: new Date().toISOString(),
        created_by: auth.ctx.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    version = data;

    await auth.supabase
      .from("agents")
      .update({
        current_version_id: version.id,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId);
  }

  const shouldPublish = body.publish !== false;
  if (shouldPublish) {
    await auth.supabase
      .from("agents")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", agentId);

    if (version.status !== "published") {
      await auth.supabase
        .from("agent_versions")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", version.id);
      version = { ...version, status: "published" };
    }
  }

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: createSnapshot ? "agent.version.create" : "agent.version.update",
    entityType: "agent_version",
    entityId: version.id,
    metadata: {
      agentId,
      source: "api_v1",
      apiKeyId: auth.ctx.keyId,
      createSnapshot,
    },
  });

  return NextResponse.json(version);
}
