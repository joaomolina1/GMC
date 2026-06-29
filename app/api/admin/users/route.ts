import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("*, teams(name), departments(name), user_quotas(monthly_token_limit, monthly_cost_limit_eur)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { userId, role } = body;

  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role required" }, { status: 400 });
  }

  const allowedRoles = ["super_admin", "admin", "power_user", "user", "guest"];
  if (!allowedRoles.includes(role)) {
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

  if (userId === user.id && role !== actor?.role && actor?.role !== "super_admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id, email, full_name, role, auth_provider")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "enterprise.user.role_update",
    entityType: "profile",
    entityId: userId,
    metadata: { role },
  });

  return NextResponse.json(data);
}
