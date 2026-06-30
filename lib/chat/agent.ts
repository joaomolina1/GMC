import type { EffortLevel, ChatMessage } from "@lib/ai/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProvider, computeModelCost } from "@lib/ai/registry";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";
import { DOCUMENT_CREATION_SYSTEM_HINT } from "@lib/ai/anthropic-document-skills";
import {
  runBetaAgentWithDocuments,
  streamBetaAgentWithDocuments,
} from "@lib/ai/anthropic-beta-runner";
import type { PersistedGeneratedFile } from "@lib/ai/persist-generated-files";
import {
  CREATE_DOCUMENTS_DISABLED_MESSAGE,
  DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE,
  modelSupportsDocumentSkills,
} from "@lib/ai/document-skills-guard";
import { getModelMaxTokens, DEFAULT_MAX_AGENT_STEPS } from "@lib/ai/model-limits";
import { buildAgentToolRegistry } from "@lib/agents/tool-runtime";
import type { ExecutedToolCall } from "@lib/agents/tool-runtime";

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  createDocuments?: boolean;
  webSearchConfig?: Record<string, unknown>;
  enabledTools?: string[];
  maxSteps?: number;
  agentId?: string;
  userId?: string;
  supabase?: SupabaseClient;
}

export interface GeneratedFileRef {
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
  download_url: string;
  file_id?: string;
}

export interface RunAgentResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  costEur: number;
  generatedFiles?: GeneratedFileRef[];
  anthropicFileIds?: string[];
  toolCalls?: ExecutedToolCall[];
  stepsUsed?: number;
}

function buildProviderOptions(config: AgentConfig, messages: ChatMessage[]) {
  const webSearch = config.webSearch !== false;
  const serverTools = webSearch ? buildAnthropicServerTools(["web_search"]) : [];
  const toolRegistry =
    config.enabledTools?.length && config.supabase
      ? buildAgentToolRegistry(config.enabledTools, {
          agentId: config.agentId,
          userId: config.userId,
          supabase: config.supabase,
        })
      : undefined;

  return {
    model: config.model,
    system: config.systemPrompt,
    temperature: config.temperature,
    effort: config.effort,
    thinkingEnabled: config.thinkingEnabled,
    messages,
    maxTokens: getModelMaxTokens(config.model),
    maxSteps: config.maxSteps ?? DEFAULT_MAX_AGENT_STEPS,
    nativeTools: serverTools.length > 0 ? serverTools : undefined,
    toolRegistry,
  };
}

function withDocumentHint(systemPrompt: string, createDocuments: boolean): string {
  if (!createDocuments) return systemPrompt;
  return `${systemPrompt}${DOCUMENT_CREATION_SYSTEM_HINT}`;
}

export async function runAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): Promise<RunAgentResult> {
  const wantsDocuments = Boolean(config.createDocuments);

  if (wantsDocuments && !modelSupportsDocumentSkills(config.model)) {
    return {
      content: DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE,
      usage: { promptTokens: 0, completionTokens: 0 },
      costEur: 0,
    };
  }

  const systemPrompt = withDocumentHint(config.systemPrompt, wantsDocuments);

  if (wantsDocuments) {
    const result = await runBetaAgentWithDocuments({
      model: config.model,
      systemPrompt,
      messages,
      temperature: config.temperature,
      effort: config.effort,
      thinkingEnabled: config.thinkingEnabled,
      webSearch: config.webSearch,
      webSearchConfig: config.webSearchConfig,
      maxTokens: getModelMaxTokens(config.model, true),
    });

    const costEur = computeModelCost(config.model, result.usage);
    return {
      content: result.content,
      usage: result.usage,
      costEur,
      anthropicFileIds: result.anthropicFileIds,
      stepsUsed: result.stepsUsed,
    };
  }

  const provider = getProvider(config.model);
  const result = await provider.generate(buildProviderOptions({ ...config, systemPrompt }, messages));
  const costEur = computeModelCost(config.model, result.usage);

  return {
    content: result.content,
    usage: result.usage,
    costEur,
    toolCalls: result.toolCalls?.map((t) => ({
      id: t.id,
      name: t.name,
      input: t.input,
      result: t.result ?? "",
      isError: Boolean(t.isError),
    })),
  };
}

export type StreamAgentEvent =
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "client_tool"; name: string; phase: "start" | "done"; result?: string }
  | { type: "anthropic_file_ids"; fileIds: string[] }
  | { type: "generated_files"; files: GeneratedFileRef[] }
  | {
      type: "done";
      usage: { promptTokens: number; completionTokens: number };
      costEur: number;
      toolCalls?: ExecutedToolCall[];
    };

export async function* streamAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): AsyncGenerator<StreamAgentEvent> {
  const wantsDocuments = Boolean(config.createDocuments);

  if (wantsDocuments && !modelSupportsDocumentSkills(config.model)) {
    yield { type: "text", text: DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE };
    yield {
      type: "done",
      usage: { promptTokens: 0, completionTokens: 0 },
      costEur: 0,
    };
    return;
  }

  const systemPrompt = withDocumentHint(config.systemPrompt, wantsDocuments);

  if (wantsDocuments) {
    let totalPrompt = 0;
    let totalCompletion = 0;

    for await (const chunk of streamBetaAgentWithDocuments({
      model: config.model,
      systemPrompt,
      messages,
      temperature: config.temperature,
      effort: config.effort,
      thinkingEnabled: config.thinkingEnabled,
      webSearch: config.webSearch,
      webSearchConfig: config.webSearchConfig,
      maxTokens: getModelMaxTokens(config.model, true),
    })) {
      if (chunk.type === "text") yield chunk;
      if (chunk.type === "server_tool") yield chunk;
      if (chunk.type === "anthropic_file_ids") yield chunk;
      if (chunk.type === "done") {
        totalPrompt = chunk.usage.promptTokens;
        totalCompletion = chunk.usage.completionTokens;
      }
    }

    const costEur = computeModelCost(config.model, {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
    });

    yield {
      type: "done",
      usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
      costEur,
    };
    return;
  }

  const provider = getProvider(config.model);
  let totalPrompt = 0;
  let totalCompletion = 0;
  const executedTools: ExecutedToolCall[] = [];

  for await (const chunk of provider.stream(buildProviderOptions({ ...config, systemPrompt }, messages))) {
    if (chunk.type === "text" && chunk.text) {
      yield { type: "text", text: chunk.text };
    }
    if (chunk.type === "server_tool" && chunk.serverToolName) {
      yield { type: "server_tool", name: chunk.serverToolName };
    }
    if (chunk.type === "tool_use" && chunk.toolCall) {
      yield { type: "client_tool", name: chunk.toolCall.name, phase: "start" };
    }
    if (chunk.type === "tool_result" && chunk.toolCall) {
      yield {
        type: "client_tool",
        name: chunk.toolCall.name,
        phase: "done",
        result: chunk.text,
      };
    }
    if (chunk.type === "done" && chunk.usage) {
      totalPrompt += chunk.usage.promptTokens;
      totalCompletion += chunk.usage.completionTokens;
      if (chunk.executedTools) {
        for (const t of chunk.executedTools) {
          executedTools.push({
            id: t.id,
            name: t.name,
            input: t.input,
            result: t.result ?? "",
            isError: Boolean(t.isError),
          });
        }
      }
    }
  }

  const costEur = computeModelCost(config.model, {
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
  });

  yield {
    type: "done",
    usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    costEur,
    toolCalls: executedTools.length ? executedTools : undefined,
  };
}

/** Detect user asking for documents when create_documents is off. */
export function detectDocumentRequestWithoutTool(
  userMessage: string,
  createDocuments: boolean
): string | null {
  if (createDocuments) return null;
  const lower = userMessage.toLowerCase();
  const hints = [
    "powerpoint",
    "pptx",
    "excel",
    "xlsx",
    "word",
    "docx",
    "pdf",
    "apresentação",
    "folha de cálculo",
  ];
  if (hints.some((h) => lower.includes(h))) {
    return CREATE_DOCUMENTS_DISABLED_MESSAGE;
  }
  return null;
}

export function toGeneratedFileRefs(files: PersistedGeneratedFile[]): GeneratedFileRef[] {
  return files.map((f) => ({
    filename: f.filename,
    mime: f.mime,
    size: f.size,
    storage_path: f.storage_path,
    download_url: f.download_url,
    file_id: f.file_id,
  }));
}
