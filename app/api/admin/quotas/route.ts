import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  let query = supabase.from("user_quotas").select("*, profiles(email, full_name)");
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { userId, monthly_token_limit, monthly_cost_limit_eur } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_quotas")
    .upsert(
      {
        user_id: userId,
        monthly_token_limit: monthly_token_limit ?? null,
        monthly_cost_limit_eur: monthly_cost_limit_eur ?? null,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "enterprise.quota.update",
    entityType: "user_quota",
    entityId: userId,
    metadata: { monthly_token_limit, monthly_cost_limit_eur },
  });

  return NextResponse.json(data);
}
