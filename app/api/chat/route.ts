import { NextResponse } from "next/server";
import { createClient, tryCreateServiceClient } from "@lib/supabase/server";
import { logUsage } from "@lib/audit";
import {
  buildAgentRuntimeConfig,
  persistAgentGeneratedFiles,
  streamAgent,
} from "@lib/agents/runtime";
import { buildUsageLogMetadata } from "@lib/chat/agent";
import type { AnthropicDocumentSkillId } from "@lib/ai/anthropic-document-skills";
import { buildChatMessages } from "@lib/chat/messages";
import { assertQuotaAvailable } from "@lib/enterprise/quotas";
import { assertRateLimit } from "@lib/enterprise/rate-limit";
import { assertModelAllowedForUser } from "@lib/enterprise/role-policies";
import type { GeneratedFileRef } from "@lib/chat/agent";
import type { TokenUsage } from "@lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const start = Date.now();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/chat", user.id);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const quotaCheck = await assertQuotaAvailable(supabase, user.id);
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.message }, { status: 402 });
  }

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

  if (!version) {
    return NextResponse.json(
      { error: "Agente sem versão configurada. Guarde uma versão no Builder primeiro." },
      { status: 400 }
    );
  }

  const modelCheck = await assertModelAllowedForUser(supabase, user.id, version.model);
  if (!modelCheck.ok) {
    return NextResponse.json({ error: modelCheck.message }, { status: 403 });
  }

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
  const runtimeConfig = await buildAgentRuntimeConfig({
    supabase,
    agentId,
    version,
    userMessage: message,
    userId: user.id,
  });

  const encoder = new TextEncoder();
  let fullContent = "";
  let finalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  let finalCost = 0;
  let finalRoute: string | undefined;
  let finalDocumentSkills: string[] | undefined;
  let finalStepsUsed: number | undefined;
  let generatedFiles: GeneratedFileRef[] = [];
  const fileStorage = (await tryCreateServiceClient()) ?? supabase;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let pendingFileIds: string[] = [];

        for await (const chunk of streamAgent(runtimeConfig, messages)) {
          if (chunk.type === "text") {
            fullContent += chunk.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk.text })}\n\n`)
            );
          }
          if (chunk.type === "server_tool") {
            const label =
              chunk.name === "code_execution"
                ? "A gerar documento…"
                : chunk.name === "web_search"
                  ? "A pesquisar na web…"
                  : chunk.name;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "server_tool", name: chunk.name, label })}\n\n`)
            );
          }
          if (chunk.type === "client_tool") {
            const label =
              chunk.phase === "start"
                ? `A usar ${chunk.name}…`
                : `${chunk.name} concluído`;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "client_tool", name: chunk.name, label, phase: chunk.phase })}\n\n`
              )
            );
          }
          if (chunk.type === "anthropic_file_ids") {
            pendingFileIds = chunk.fileIds;
          }
          if (chunk.type === "done") {
            finalUsage = chunk.usage;
            finalCost = chunk.costEur;
            finalRoute = chunk.route;
            finalDocumentSkills = chunk.documentSkillsUsed;
            finalStepsUsed = chunk.stepsUsed;
          }
        }

        if (pendingFileIds.length > 0) {
          generatedFiles = await persistAgentGeneratedFiles({
            fileIds: pendingFileIds,
            userId: user.id,
            supabase: fileStorage,
          });
          if (generatedFiles.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "files", files: generatedFiles })}\n\n`
              )
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", conversationId: convId })}\n\n`)
        );

        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: {
            text: fullContent,
            generated_files: generatedFiles,
          },
          tokens_prompt: finalUsage.promptTokens,
          tokens_completion: finalUsage.completionTokens,
          model: version.model,
          cost_eur: finalCost,
        });

        await logUsage(supabase, {
          userId: user.id,
          model: version.model,
          provider: "anthropic",
          promptTokens: finalUsage.promptTokens,
          completionTokens: finalUsage.completionTokens,
          costEur: finalCost,
          latencyMs: Date.now() - start,
          metadata: buildUsageLogMetadata({
            usage: finalUsage,
            route: finalRoute,
            documentSkillsUsed: finalDocumentSkills as AnthropicDocumentSkillId[] | undefined,
            stepsUsed: finalStepsUsed,
            extra: {
              agentId,
              conversationId: convId,
              generatedFiles: generatedFiles.length,
            },
          }),
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
