import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export const runtime = "nodejs";

/** Estado de um render (a UI faz polling até `done`). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("clip_renders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Render não encontrado" }, { status: 404 });
  return NextResponse.json(data);
}
