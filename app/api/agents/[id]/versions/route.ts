import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { system_prompt, model, temperature, skills, tools } = body;

  const { data: latest } = await supabase
    .from("agent_versions")
    .select("version")
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: version, error } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: agentId,
      version: nextVersion,
      system_prompt: system_prompt ?? "",
      model: model ?? "claude-sonnet-4-6",
      temperature: temperature ?? 0.7,
      skills: skills ?? ["web_search", "read_document", "vision", "knowledge_search"],
      tools: tools ?? {},
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "agent.version.create",
    entityType: "agent_version",
    entityId: version.id,
    metadata: { agentId, version: nextVersion },
  });

  return NextResponse.json(version);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
