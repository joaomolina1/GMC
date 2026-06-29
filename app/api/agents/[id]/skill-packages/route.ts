import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { parseSkillUpload } from "@lib/agent-skills/parser";

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
    .from("agent_skill_packages")
    .select("id, name, description, created_at")
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

  const { data: agent } = await supabase
    .from("agents")
    .select("id, owner_id")
    .eq("id", agentId)
    .single();

  if (!agent) return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  if (agent.owner_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseSkillUpload(buffer, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ficheiro inválido" },
      { status: 400 }
    );
  }

  const storagePath = `${user.id}/skills/${agentId}/${Date.now()}-${parsed.name}.zip`;
  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/zip",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: row, error } = await supabase
    .from("agent_skill_packages")
    .insert({
      agent_id: agentId,
      name: parsed.name,
      description: parsed.description,
      skill_md: parsed.skillMd,
      extra_files: parsed.extraFiles,
      storage_path: storagePath,
      created_by: user.id,
    })
    .select("id, name, description, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const packageId = searchParams.get("id");
  if (!packageId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: pkg } = await supabase
    .from("agent_skill_packages")
    .select("id, storage_path, agent_id")
    .eq("id", packageId)
    .single();

  if (!pkg) return NextResponse.json({ error: "Skill não encontrada" }, { status: 404 });

  if (pkg.storage_path) {
    await supabase.storage.from("attachments").remove([pkg.storage_path]);
  }

  const { error } = await supabase.from("agent_skill_packages").delete().eq("id", packageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
