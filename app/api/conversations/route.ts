import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { purgeExpiredConversations } from "@lib/chat/conversations";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId é obrigatório" }, { status: 400 });
  }

  await purgeExpiredConversations();

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      messages(count)
    `
    )
    .eq("user_id", user.id)
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row) => {
    const messageCount = Array.isArray(row.messages)
      ? (row.messages[0] as { count?: number })?.count ?? 0
      : 0;

    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      message_count: messageCount,
    };
  });

  return NextResponse.json(rows);
}
