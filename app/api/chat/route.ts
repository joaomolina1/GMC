import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { logUsage } from "@lib/audit";
import { streamAgentLoop } from "@lib/skills/runner";
import { buildChatMessages, buildAttachmentHint } from "@lib/chat/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const start = Date.now();
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { agentId, conversationId, message, attachments } = body as {
    agentId: string;
    conversationId?: string;
    message: string;
    attachments?: Array<{ storage_path: string; filename: string; mime: string; kind: string }>;
  };

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: version } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("id", agent.current_version_id)
    .single();

  if (!version) return NextResponse.json({ error: "No published version" }, { status: 400 });

  let convId = conversationId;
  if (!convId) {
    const { data: conv } = await supabase
      .from("conversations")
      .insert({ agent_id: agentId, user_id: user.id, title: message.slice(0, 80) })
      .select("id")
      .single();
    convId = conv?.id;
  }

  await supabase.from("messages").insert({
    conversation_id: convId,
    role: "user",
    content: { text: message, attachments: attachments ?? [] },
  });

  if (attachments?.length) {
    for (const att of attachments) {
      if (!att.storage_path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "Invalid attachment path" }, { status: 403 });
      }
      await supabase.from("attachments").insert({
        conversation_id: convId,
        storage_path: att.storage_path,
        mime: att.mime,
        kind: att.kind,
        filename: att.filename,
      });
    }
  }

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(50);

  const messages = await buildChatMessages(history ?? [], supabase);

  const attachmentHint = buildAttachmentHint(attachments);
  const systemPrompt = attachmentHint
    ? `${version.system_prompt}${attachmentHint}`
    : version.system_prompt;

  const skills = (version.skills as string[])?.length
    ? (version.skills as string[])
    : ["web_search", "read_document", "vision", "knowledge_search"];

  const encoder = new TextEncoder();
  let fullContent = "";
  let finalUsage = { promptTokens: 0, completionTokens: 0 };
  let finalCost = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamAgentLoop({
          config: {
            model: version.model,
            systemPrompt,
            temperature: Number(version.temperature),
            skills,
          },
          messages,
          ctx: {
            userId: user.id,
            agentId,
            conversationId: convId,
            supabase,
          },
          onText: (text) => {
            fullContent += text;
          },
        })) {
          if (chunk.type === "text") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk.text })}\n\n`));
          }
          if (chunk.type === "tool") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tool", name: chunk.name })}\n\n`));
          }
          if (chunk.type === "done") {
            finalUsage = chunk.usage;
            finalCost = chunk.costEur;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", conversationId: convId })}\n\n`));
          }
        }

        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: { text: fullContent },
          tokens_prompt: finalUsage.promptTokens,
          tokens_completion: finalUsage.completionTokens,
          model: version.model,
          cost_eur: finalCost,
        });

        await logUsage(serviceClient, {
          userId: user.id,
          model: version.model,
          provider: "anthropic",
          promptTokens: finalUsage.promptTokens,
          completionTokens: finalUsage.completionTokens,
          costEur: finalCost,
          latencyMs: Date.now() - start,
          metadata: { agentId, conversationId: convId },
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
