import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const userId = searchParams.get("userId");
  const agentId = searchParams.get("agentId");
  const q = searchParams.get("q");

  let query = supabase
    .from("conversations")
    .select(
      `
      id,
      title,
      created_at,
      updated_at,
      user_id,
      agent_id,
      profiles!conversations_user_id_fkey(email, full_name),
      agents!conversations_agent_id_fkey(name),
      messages(count)
    `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (userId) query = query.eq("user_id", userId);
  if (agentId) query = query.eq("agent_id", agentId);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row) => {
    const profile = row.profiles as { email?: string; full_name?: string } | null;
    const agent = row.agents as { name?: string } | null;
    const messageCount = Array.isArray(row.messages)
      ? (row.messages[0] as { count?: number })?.count ?? 0
      : 0;

    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_id: row.user_id,
      agent_id: row.agent_id,
      user_email: profile?.email ?? null,
      user_name: profile?.full_name ?? null,
      agent_name: agent?.name ?? null,
      message_count: messageCount,
    };
  });

  return NextResponse.json(rows);
}
