import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { extractMessageText } from "@lib/chat/display";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at, agent_id, user_id")
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      agent_id: conversation.agent_id,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      text: extractMessageText(m.content),
      raw_content: m.content,
      created_at: m.created_at,
    })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase.from("conversations").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
