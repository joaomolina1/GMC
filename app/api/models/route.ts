import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  let query = supabase
    .from("models")
    .select("id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok")
    .order("display_name");

  if (!isAdmin) {
    const { data: allowed } = await supabase
      .from("user_allowed_models")
      .select("model_id")
      .eq("user_id", user.id);

    if (allowed && allowed.length > 0) {
      query = query.in(
        "id",
        allowed.map((a) => a.model_id)
      );
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
