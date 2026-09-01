import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { parseSkillUpload } from "@lib/agent-skills/parser";
import { sanitizeStorageFilename } from "@lib/storage/filename";
import {
  createAnthropicCustomSkill,
  deleteAnthropicCustomSkill,
} from "@lib/agent-skills/anthropic-custom-skills";
import {
  attachSkillToCurrentVersion,
  detachSkillFromCurrentVersion,
  updateCurrentVersionSkillIds,
} from "@lib/agent-skills/version-attach";
import { parseSkillPackageIds } from "@lib/agent-skills/ids";

async function requireAgentOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  agentId: string
) {
  const { data: agent } = await supabase
    .from("agents")
    .select("id, owner_id")
    .eq("id", agentId)
    .single();

  if (!agent) return { error: NextResponse.json({ error: "Agente não encontrado" }, { status: 404 }) };

  if (agent.owner_id !== userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
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

  const { data, error } = await supabase
    .from("agent_skill_packages")
    .select("id, name, description, created_at, anthropic_skill_id")
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

  const access = await requireAgentOwner(supabase, user.id, agentId);
  if (access.error) return access.error;

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

  const storagePath = `${user.id}/skills/${agentId}/${Date.now()}-${sanitizeStorageFilename(parsed.name)}.zip`;
  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/zip",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Storage: ${uploadError.message}` }, { status: 500 });
  }

  const anthropic = await createAnthropicCustomSkill({
    name: parsed.name,
    skillMd: parsed.skillMd,
    extraFiles: parsed.extraFiles,
    displayTitle: parsed.name,
  });

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
      anthropic_skill_id: anthropic.skillId,
    })
    .select("id, name, description, created_at, anthropic_skill_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const skillPackageIds = await attachSkillToCurrentVersion(supabase, agentId, row.id);

  return NextResponse.json({
    ...row,
    active: true,
    skill_package_ids: skillPackageIds,
    anthropic_warning: anthropic.error ?? null,
  });
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

  const access = await requireAgentOwner(supabase, user.id, agentId);
  if (access.error) return access.error;

  const body = (await request.json()) as { id?: string; active?: boolean };
  if (!body.id || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "id e active são obrigatórios" }, { status: 400 });
  }

  const { data: pkg } = await supabase
    .from("agent_skill_packages")
    .select("id, agent_id")
    .eq("id", body.id)
    .eq("agent_id", agentId)
    .single();

  if (!pkg) return NextResponse.json({ error: "Skill não encontrada" }, { status: 404 });

  const skillPackageIds = await updateCurrentVersionSkillIds(supabase, agentId, (ids) => {
    const current = parseSkillPackageIds(ids);
    if (body.active) {
      return current.includes(body.id!) ? current : [...current, body.id!];
    }
    return current.filter((id) => id !== body.id);
  });

  return NextResponse.json({ ok: true, skill_package_ids: skillPackageIds ?? [] });
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

  const access = await requireAgentOwner(supabase, user.id, agentId);
  if (access.error) return access.error;

  const { searchParams } = new URL(request.url);
  const packageId = searchParams.get("id");
  if (!packageId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: pkg } = await supabase
    .from("agent_skill_packages")
    .select("id, storage_path, agent_id, anthropic_skill_id")
    .eq("id", packageId)
    .eq("agent_id", agentId)
    .single();

  if (!pkg) return NextResponse.json({ error: "Skill não encontrada" }, { status: 404 });

  if (pkg.storage_path) {
    await supabase.storage.from("attachments").remove([pkg.storage_path]);
  }
  if (pkg.anthropic_skill_id) {
    void deleteAnthropicCustomSkill(pkg.anthropic_skill_id);
  }

  await detachSkillFromCurrentVersion(supabase, agentId, packageId);

  const { error } = await supabase.from("agent_skill_packages").delete().eq("id", packageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
