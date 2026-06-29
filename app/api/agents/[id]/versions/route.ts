import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

const DEFAULT_SKILLS: string[] = [];

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

  const body = await request.json();
  const { system_prompt, model, temperature, effort, thinking_enabled, skills, tools, skill_package_ids, createSnapshot } = body as {
    system_prompt?: string;
    model?: string;
    temperature?: number;
    effort?: string;
    thinking_enabled?: boolean;
    skills?: string[];
    tools?: Record<string, unknown>;
    skill_package_ids?: string[];
    createSnapshot?: boolean;
  };

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, current_version_id")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const versionPayload = {
    system_prompt: system_prompt ?? "",
    model: model ?? "claude-sonnet-4-6",
    temperature: temperature ?? 0.7,
    effort: effort ?? "medium",
    thinking_enabled: thinking_enabled ?? false,
    skills: skills ?? DEFAULT_SKILLS,
    tools: tools ?? {},
    skill_package_ids: skill_package_ids ?? [],
  };

  let version;
  let action: string;

  const shouldUpdateInPlace = agent.current_version_id && !createSnapshot;

  if (shouldUpdateInPlace) {
    const { data, error } = await supabase
      .from("agent_versions")
      .update(versionPayload)
      .eq("id", agent.current_version_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    version = data;
    action = "agent.version.update";
  } else {
    const { data: latest } = await supabase
      .from("agent_versions")
      .select("version")
      .eq("agent_id", agentId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version ?? 0) + 1;

    const { data, error } = await supabase
      .from("agent_versions")
      .insert({
        agent_id: agentId,
        version: nextVersion,
        ...versionPayload,
        status: "published",
        published_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    version = data;
    action = "agent.version.create";

    const { error: agentUpdateError } = await supabase
      .from("agents")
      .update({
        current_version_id: version.id,
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId);

    if (agentUpdateError) {
      return NextResponse.json({ error: agentUpdateError.message }, { status: 500 });
    }
  }

  if (shouldUpdateInPlace) {
    const { error: touchError } = await supabase
      .from("agents")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", agentId);

    if (touchError) {
      return NextResponse.json({ error: touchError.message }, { status: 500 });
    }
  }

  await logAudit(supabase, {
    actorId: user.id,
    action,
    entityType: "agent_version",
    entityId: version.id,
    metadata: { agentId, version: version.version, inPlace: shouldUpdateInPlace },
  });

  return NextResponse.json(version);
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

  const { data, error } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
