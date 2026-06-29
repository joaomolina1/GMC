import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { extractMessageText } from "@lib/chat/display";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { data: conversation, error: convError } = await supabase
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
      agents!conversations_agent_id_fkey(name)
    `
    )
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, role, content, model, cost_eur, tokens_prompt, tokens_completion, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  const { data: usage } = await supabase
    .from("usage_logs")
    .select("id, model, cost_eur, prompt_tokens, completion_tokens, latency_ms, metadata, created_at")
    .contains("metadata", { conversationId: id })
    .order("created_at", { ascending: false });

  const profile = conversation.profiles as { email?: string; full_name?: string } | null;
  const agent = conversation.agents as { name?: string } | null;

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      user_id: conversation.user_id,
      agent_id: conversation.agent_id,
      user_email: profile?.email ?? null,
      user_name: profile?.full_name ?? null,
      agent_name: agent?.name ?? null,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      text: extractMessageText(m.content),
      raw_content: m.content,
      model: m.model,
      cost_eur: m.cost_eur,
      tokens_prompt: m.tokens_prompt,
      tokens_completion: m.tokens_completion,
      created_at: m.created_at,
    })),
    usage_logs: usage ?? [],
  });
}
