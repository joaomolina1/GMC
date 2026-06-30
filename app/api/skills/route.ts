import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { modelSupportsDocumentSkills } from "@lib/ai/document-skills-guard";
import { ANTHROPIC_DOCUMENT_SKILL_IDS } from "@lib/ai/anthropic-document-skills";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  const managedSkills = ANTHROPIC_DOCUMENT_SKILL_IDS.map((key) => ({
    key,
    kind: "managed" as const,
    readiness: hasAnthropicKey ? "ready" : "missing_config",
    note: hasAnthropicKey
      ? "Skill nativa Anthropic (pptx/xlsx/docx/pdf). Requer tool «Criar documentos» activa."
      : "Configure ANTHROPIC_API_KEY no servidor.",
    requirement: "create_documents + code_execution na conta Anthropic",
  }));

  const customTools = [
    {
      key: "knowledge_search",
      kind: "tool" as const,
      readiness: "ready",
      note: "Pesquisa dinâmica na base de conhecimento (loop agêntico).",
    },
    {
      key: "http_request",
      kind: "tool" as const,
      readiness: "ready",
      note: "Pedidos HTTP a URLs públicas.",
    },
    {
      key: "fetch_url",
      kind: "tool" as const,
      readiness: "ready",
      note: "Extrai texto de páginas web.",
    },
    {
      key: "web_search",
      kind: "server_tool" as const,
      readiness: hasAnthropicKey ? "ready" : "missing_config",
      note: "Pesquisa web nativa Anthropic (server-side).",
    },
    {
      key: "create_documents",
      kind: "server_tool" as const,
      readiness: hasAnthropicKey ? "ready" : "missing_config",
      note: "Geração de ficheiros via code execution + skills Anthropic.",
      requirement: "Modelo com suporte a tools (ex. Sonnet 4.6, Opus 4.8)",
    },
  ];

  const modelSamples = ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"];
  const modelSupport = modelSamples.map((id) => ({
    model: id,
    document_skills: modelSupportsDocumentSkills(id),
  }));

  return NextResponse.json({
    status: [...managedSkills, ...customTools],
    model_support: modelSupport,
    capabilities: {
      agentic_loop: true,
      mcp: "planned",
      custom_skill_execution: "partial",
    },
  });
}
