import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("visibility", "public")
    .eq("status", "published")
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("agent_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (existing) {
    await supabase.from("agent_favorites").delete().eq("id", existing.id);
    return NextResponse.json({ favorited: false });
  }

  const { error } = await supabase.from("agent_favorites").insert({
    user_id: user.id,
    agent_id: agentId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ favorited: true });
}
