import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const path = new URL(request.url).pathname.replace("/api/admin/", "");

  if (path === "costs") {
    const { data, error } = await supabase
      .from("usage_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (path === "logs") {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
