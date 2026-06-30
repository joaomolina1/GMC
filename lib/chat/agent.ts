import type { EffortLevel, ChatMessage, TokenUsage } from "@lib/ai/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BetaContainerUploadBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaRequestMCPServerURLDefinition } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getProvider, computeModelCost } from "@lib/ai/registry";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";
import { DOCUMENT_CREATION_SYSTEM_HINT } from "@lib/ai/anthropic-document-skills";
import type { AnthropicDocumentSkillId } from "@lib/ai/anthropic-document-skills";
import {
  needsDocumentCreation,
  resolveDocumentSkillsForTurn,
} from "@lib/ai/document-skill-detect";
import {
  runBetaAgentWithDocuments,
  streamBetaAgentWithDocuments,
  runBetaAgentSession,
  streamBetaAgentSession,
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
import { usageCacheMetadata } from "@lib/ai/prompt-cache";

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  /** Agent has document-creation capability enabled in builder. */
  createDocuments?: boolean;
  webSearchConfig?: Record<string, unknown>;
  enabledTools?: string[];
  maxSteps?: number;
  agentId?: string;
  userId?: string;
  supabase?: SupabaseClient;
  mcpServers?: BetaRequestMCPServerURLDefinition[];
  containerUploadBlocks?: BetaContainerUploadBlockParam[];
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
  usage: TokenUsage;
  costEur: number;
  generatedFiles?: GeneratedFileRef[];
  anthropicFileIds?: string[];
  toolCalls?: ExecutedToolCall[];
  stepsUsed?: number;
  route?: "light" | "beta-documents" | "beta-session";
  documentSkillsUsed?: AnthropicDocumentSkillId[];
}

function getLastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
  }
  return "";
}

export interface ResolvedAgentRoute {
  route: "light" | "beta-documents" | "beta-session";
  createDocumentsThisTurn: boolean;
  documentSkillIds?: AnthropicDocumentSkillId[];
}

export function resolveAgentRoute(config: AgentConfig, messages: ChatMessage[]): ResolvedAgentRoute {
  const needsMcpOrContainer = Boolean(
    config.mcpServers?.length || config.containerUploadBlocks?.length
  );
  const userText = getLastUserText(messages);
  const createDocumentsThisTurn =
    Boolean(config.createDocuments) && needsDocumentCreation(userText);
  const documentSkillIds = createDocumentsThisTurn
    ? resolveDocumentSkillsForTurn(userText)
    : undefined;

  if (createDocumentsThisTurn) {
    return { route: "beta-documents", createDocumentsThisTurn: true, documentSkillIds };
  }
  if (needsMcpOrContainer) {
    return { route: "beta-session", createDocumentsThisTurn: false };
  }
  return { route: "light", createDocumentsThisTurn: false };
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

function betaRunOptions(
  config: AgentConfig,
  systemPrompt: string,
  messages: ChatMessage[],
  route: ResolvedAgentRoute
) {
  return {
    model: config.model,
    systemPrompt,
    messages,
    temperature: config.temperature,
    effort: config.effort,
    thinkingEnabled: config.thinkingEnabled,
    webSearch: config.webSearch,
    webSearchConfig: config.webSearchConfig,
    maxTokens: getModelMaxTokens(config.model, route.createDocumentsThisTurn),
    createDocuments: route.createDocumentsThisTurn,
    documentSkillIds: route.documentSkillIds,
    mcpServers: config.mcpServers,
    containerUploadBlocks: config.containerUploadBlocks,
  };
}

function withDocumentHint(systemPrompt: string, includeHint: boolean): string {
  if (!includeHint) return systemPrompt;
  return `${systemPrompt}${DOCUMENT_CREATION_SYSTEM_HINT}`;
}

export async function runAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): Promise<RunAgentResult> {
  const route = resolveAgentRoute(config, messages);

  if (route.createDocumentsThisTurn && !modelSupportsDocumentSkills(config.model)) {
    return {
      content: DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE,
      usage: { promptTokens: 0, completionTokens: 0 },
      costEur: 0,
      route: route.route,
    };
  }

  const systemPrompt = withDocumentHint(config.systemPrompt, route.createDocumentsThisTurn);

  if (route.route !== "light") {
    const run = route.route === "beta-documents" ? runBetaAgentWithDocuments : runBetaAgentSession;
    const result = await run(betaRunOptions(config, systemPrompt, messages, route));
    const costEur = computeModelCost(config.model, result.usage);
    return {
      content: result.content,
      usage: result.usage,
      costEur,
      anthropicFileIds: result.anthropicFileIds,
      stepsUsed: result.stepsUsed,
      route: route.route,
      documentSkillsUsed: result.documentSkillsUsed,
    };
  }

  const provider = getProvider(config.model);
  const result = await provider.generate(buildProviderOptions({ ...config, systemPrompt }, messages));
  const costEur = computeModelCost(config.model, result.usage);

  return {
    content: result.content,
    usage: result.usage,
    costEur,
    route: route.route,
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
      usage: TokenUsage;
      costEur: number;
      toolCalls?: ExecutedToolCall[];
      route?: ResolvedAgentRoute["route"];
      documentSkillsUsed?: AnthropicDocumentSkillId[];
      stepsUsed?: number;
    };

export async function* streamAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): AsyncGenerator<StreamAgentEvent> {
  const route = resolveAgentRoute(config, messages);

  if (route.createDocumentsThisTurn && !modelSupportsDocumentSkills(config.model)) {
    yield { type: "text", text: DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE };
    yield {
      type: "done",
      usage: { promptTokens: 0, completionTokens: 0 },
      costEur: 0,
      route: route.route,
    };
    return;
  }

  const systemPrompt = withDocumentHint(config.systemPrompt, route.createDocumentsThisTurn);

  if (route.route !== "light") {
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
    let stepsUsed: number | undefined;
    let documentSkillsUsed: AnthropicDocumentSkillId[] | undefined;
    const stream =
      route.route === "beta-documents" ? streamBetaAgentWithDocuments : streamBetaAgentSession;

    for await (const chunk of stream(
      betaRunOptions(config, systemPrompt, messages, route)
    )) {
      if (chunk.type === "text") yield chunk;
      if (chunk.type === "server_tool") yield chunk;
      if (chunk.type === "mcp_tool") {
        yield { type: "server_tool", name: `mcp:${chunk.name}` };
      }
      if (chunk.type === "anthropic_file_ids") yield chunk;
      if (chunk.type === "done") {
        usage = chunk.usage;
        stepsUsed = chunk.stepsUsed;
        documentSkillsUsed = chunk.documentSkillsUsed;
      }
    }

    const costEur = computeModelCost(config.model, usage);

    yield {
      type: "done",
      usage,
      costEur,
      route: route.route,
      documentSkillsUsed,
      stepsUsed,
    };
    return;
  }

  const provider = getProvider(config.model);
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
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
      usage = chunk.usage;
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

  const costEur = computeModelCost(config.model, usage);

  yield {
    type: "done",
    usage,
    costEur,
    route: route.route,
    toolCalls: executedTools.length ? executedTools : undefined,
  };
}

/** Detect user asking for documents when create_documents is off. */
export function detectDocumentRequestWithoutTool(
  userMessage: string,
  createDocuments: boolean
): string | null {
  if (createDocuments) return null;
  if (needsDocumentCreation(userMessage)) {
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

export function buildUsageLogMetadata(options: {
  usage: TokenUsage;
  route?: string;
  documentSkillsUsed?: AnthropicDocumentSkillId[];
  stepsUsed?: number;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...options.extra,
    route: options.route,
    document_skills: options.documentSkillsUsed,
    steps_used: options.stepsUsed,
    ...usageCacheMetadata(options.usage),
  };
}
