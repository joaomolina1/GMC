import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, system_prompt, model, skills } = body;

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .insert({
      owner_id: user.id,
      name: name ?? "Novo Agente",
      description: description ?? "",
      status: "draft",
    })
    .select()
    .single();

  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });

  const { data: version, error: versionError } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: agent.id,
      version: 1,
      system_prompt: system_prompt ?? "És um assistente útil do Grupo Media Capital.",
      model: model ?? "claude-sonnet-4-6",
      skills: skills ?? ["web_search", "read_document", "vision", "knowledge_search"],
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });

  await supabase
    .from("agents")
    .update({ current_version_id: version.id })
    .eq("id", agent.id);

  await logAudit(supabase, {
    actorId: user.id,
    action: "agent.create",
    entityType: "agent",
    entityId: agent.id,
  });

  return NextResponse.json({ ...agent, current_version: version });
}
