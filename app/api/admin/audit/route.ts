import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
  const entityType = searchParams.get("entityType");
  const actionFilter = searchParams.get("actionFilter");

  if (action === "rollups") {
    const { data, error } = await supabase
      .from("cost_rollups")
      .select("*, profiles(email, full_name)")
      .order("period_start", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let query = supabase
    .from("audit_logs")
    .select("*, profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType) query = query.eq("entity_type", entityType);
  if (actionFilter) query = query.ilike("action", `%${actionFilter}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
