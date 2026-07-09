import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";
import { USER_ROLES, type RolePolicy, type UserRole } from "@lib/enterprise/role-policies";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const [{ data: quotas, error: qErr }, { data: allowed, error: aErr }, { data: models }] =
    await Promise.all([
      supabase.from("role_quotas").select("*"),
      supabase.from("role_allowed_models").select("role, model_id"),
      supabase.from("models").select("id, display_name, tier, status").eq("enabled", true).order("sort_order"),
    ]);

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const quotaMap = new Map((quotas ?? []).map((q) => [q.role, q]));
  const modelsByRole = new Map<string, string[]>();
  for (const row of allowed ?? []) {
    const list = modelsByRole.get(row.role) ?? [];
    list.push(row.model_id);
    modelsByRole.set(row.role, list);
  }

  const policies: RolePolicy[] = USER_ROLES.map((role) => {
    const q = quotaMap.get(role);
    return {
      role,
      monthly_token_limit: q?.monthly_token_limit ?? null,
      monthly_cost_limit_eur: q?.monthly_cost_limit_eur ?? null,
      allowed_model_ids: modelsByRole.get(role) ?? [],
      updated_at: q?.updated_at,
    };
  });

  return NextResponse.json({ policies, models: models ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const {
    role,
    monthly_token_limit,
    monthly_cost_limit_eur,
    allowed_model_ids,
  } = body as {
    role?: string;
    monthly_token_limit?: number | null;
    monthly_cost_limit_eur?: number | null;
    allowed_model_ids?: string[];
  };

  if (!role || !USER_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: "role inválido" }, { status: 400 });
  }

  const requestedModelIds = Array.isArray(allowed_model_ids)
    ? Array.from(new Set(allowed_model_ids.filter((id): id is string => typeof id === "string")))
    : [];

  if (
    !["admin", "super_admin"].includes(role) &&
    requestedModelIds.length > 0 &&
    !requestedModelIds.includes(DEFAULT_AGENT_MODEL)
  ) {
    return NextResponse.json(
      { error: "Claude Haiku 4.5 é obrigatório porque é o modelo base de todos os agentes novos." },
      { status: 400 }
    );
  }

  if (requestedModelIds.length > 0) {
    const { data: validModels, error: validModelsError } = await supabase
      .from("models")
      .select("id")
      .in("id", requestedModelIds)
      .eq("enabled", true);
    if (validModelsError) {
      return NextResponse.json({ error: validModelsError.message }, { status: 500 });
    }
    if ((validModels ?? []).length !== requestedModelIds.length) {
      return NextResponse.json({ error: "A lista contém modelos inválidos ou inativos." }, { status: 400 });
    }
  }

  const { error: quotaError } = await supabase.from("role_quotas").upsert(
    {
      role,
      monthly_token_limit: monthly_token_limit ?? null,
      monthly_cost_limit_eur: monthly_cost_limit_eur ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "role" }
  );

  if (quotaError) {
    return NextResponse.json({ error: quotaError.message }, { status: 500 });
  }

  await supabase.from("role_allowed_models").delete().eq("role", role);

  if (requestedModelIds.length > 0) {
    const { error: modelsError } = await supabase.from("role_allowed_models").insert(
      requestedModelIds.map((model_id) => ({ role, model_id }))
    );
    if (modelsError) {
      return NextResponse.json({ error: modelsError.message }, { status: 500 });
    }
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "enterprise.role_policy.update",
    entityType: "role",
    entityId: role,
    metadata: { monthly_token_limit, monthly_cost_limit_eur, allowed_model_ids: requestedModelIds },
  });

  return NextResponse.json({ ok: true, role });
}
