import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";
import { tryCreateServiceClient } from "@lib/supabase/server";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const [{ data, error }, { data: allowedModels, error: modelsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, teams(name), departments(name)")
      .order("created_at", { ascending: false }),
    supabase.from("user_allowed_models").select("user_id, model_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (modelsError) return NextResponse.json({ error: modelsError.message }, { status: 500 });

  const byUser = new Map<string, string[]>();
  for (const row of allowedModels ?? []) {
    const ids = byUser.get(row.user_id) ?? [];
    ids.push(row.model_id);
    byUser.set(row.user_id, ids);
  }

  return NextResponse.json(
    (data ?? []).map((profile) => ({
      ...profile,
      allowed_model_ids: byUser.get(profile.id) ?? [],
    }))
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { userId, role, allowed_model_ids } = body as {
    userId?: string;
    role?: string;
    allowed_model_ids?: string[];
  };

  if (!userId || (role === undefined && allowed_model_ids === undefined)) {
    return NextResponse.json(
      { error: "userId e pelo menos uma alteração são obrigatórios" },
      { status: 400 }
    );
  }

  const allowedRoles = ["super_admin", "admin", "power_user", "user", "guest"];
  if (role !== undefined && !allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (role === "super_admin" && actor?.role !== "super_admin") {
    return NextResponse.json({ error: "Only super_admin can assign super_admin" }, { status: 403 });
  }

  if (role !== undefined && userId === user.id && role !== actor?.role && actor?.role !== "super_admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  const service = await tryCreateServiceClient();
  const db = service ?? supabase;

  let profileData: Record<string, unknown> | null = null;
  if (role !== undefined) {
    const { data, error } = await db
      .from("profiles")
      .update({ role })
      .eq("id", userId)
      .select("id, email, full_name, role, auth_provider")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 });
    }
    profileData = data;
  }

  let normalizedModelIds: string[] | undefined;
  if (allowed_model_ids !== undefined) {
    normalizedModelIds = Array.from(
      new Set(allowed_model_ids.filter((id): id is string => typeof id === "string"))
    );
    if (
      normalizedModelIds.length > 0 &&
      !normalizedModelIds.includes(DEFAULT_AGENT_MODEL)
    ) {
      return NextResponse.json(
        { error: "Claude Haiku 4.5 é obrigatório para overrides de utilizador." },
        { status: 400 }
      );
    }
    if (normalizedModelIds.length > 0) {
      const { data: validModels, error: validModelsError } = await db
        .from("models")
        .select("id")
        .in("id", normalizedModelIds)
        .eq("enabled", true);
      if (validModelsError) {
        return NextResponse.json({ error: validModelsError.message }, { status: 500 });
      }
      if ((validModels ?? []).length !== normalizedModelIds.length) {
        return NextResponse.json({ error: "A lista contém modelos inválidos ou inativos." }, { status: 400 });
      }
    }

    const { error: deleteError } = await db
      .from("user_allowed_models")
      .delete()
      .eq("user_id", userId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    if (normalizedModelIds.length > 0) {
      const { error: insertError } = await db.from("user_allowed_models").insert(
        normalizedModelIds.map((model_id) => ({ user_id: userId, model_id }))
      );
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: allowed_model_ids !== undefined ? "enterprise.user.models_update" : "enterprise.user.role_update",
    entityType: "profile",
    entityId: userId,
    metadata: { role, allowed_model_ids: normalizedModelIds },
  });

  return NextResponse.json({
    ...(profileData ?? {}),
    id: userId,
    ...(normalizedModelIds !== undefined ? { allowed_model_ids: normalizedModelIds } : {}),
  });
}
