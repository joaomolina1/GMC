import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { getAllowedModelIdsForUser } from "@lib/enterprise/role-policies";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const includeRetired = searchParams.get("includeRetired") === "true";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  let query = supabase
    .from("models")
    .select(
      "id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok, status, tier, sort_order, notes"
    )
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (!includeRetired) {
    query = query.eq("enabled", true);
  }

  if (!isAdmin) {
    const allowedIds = await getAllowedModelIdsForUser(supabase, user.id);
    if (allowedIds !== null && allowedIds.length === 0) {
      return NextResponse.json([]);
    }
    if (allowedIds !== null) {
      query = query.in("id", allowedIds);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
