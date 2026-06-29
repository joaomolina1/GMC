import { NextResponse } from "next/server";
import { createServiceClient, createClient } from "@lib/supabase/server";
import { EXAMPLE_AGENTS, PLATFORM_TAG } from "@lib/agents/examples";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Apenas administradores podem carregar exemplos" }, { status: 403 });
  }

  let admin;
  try {
    admin = await createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY necessária para criar agentes públicos" },
      { status: 503 }
    );
  }

  const { data: existing } = await admin
    .from("agents")
    .select("name")
    .contains("tags", [PLATFORM_TAG]);

  const existingNames = new Set((existing ?? []).map((a) => a.name));

  const created: Array<{ id: string; name: string }> = [];
  const skipped: string[] = [];

  for (const example of EXAMPLE_AGENTS) {
    if (existingNames.has(example.name)) {
      skipped.push(example.name);
      continue;
    }

    const { data: agent, error: agentError } = await admin
      .from("agents")
      .insert({
        owner_id: user.id,
        name: example.name,
        description: example.description,
        category: example.category,
        tags: example.tags,
        visibility: "public",
        status: "published",
      })
      .select("id")
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: agentError?.message ?? "Falha ao criar agente" }, { status: 500 });
    }

    const { data: version, error: versionError } = await admin
      .from("agent_versions")
      .insert({
        agent_id: agent.id,
        version: 1,
        system_prompt: example.system_prompt,
        model: example.model,
        effort: example.effort,
        thinking_enabled: example.thinking_enabled,
        skills: example.skills,
        tools: {},
        status: "published",
        published_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: versionError?.message ?? "Falha ao criar versão" }, { status: 500 });
    }

    await admin
      .from("agents")
      .update({ current_version_id: version.id })
      .eq("id", agent.id);

    created.push({ id: agent.id, name: example.name });
    existingNames.add(example.name);
  }

  return NextResponse.json({ created, skipped, count: created.length });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("visibility", "public")
    .contains("tags", [PLATFORM_TAG]);

  return NextResponse.json({ platformExamples: count ?? 0 });
}
