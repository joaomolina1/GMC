import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContainerUploadBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaRequestMCPServerURLDefinition,
  BetaTextBlock,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import type { ChatMessage, EffortLevel, TokenUsage } from "@lib/ai/types";
import type { AgentToolRegistry, ExecutedToolCall } from "@lib/agents/tool-runtime";
import { buildAnthropicRequestExtras } from "@lib/ai/anthropic-params";
import {
  ANTHROPIC_DOCUMENT_BETAS,
  type AnthropicDocumentSkillId,
  buildCodeExecutionTool,
  buildDocumentCreationTools,
  buildDocumentSkillParams,
} from "@lib/ai/anthropic-document-skills";
import { extractFileIdsFromPayload, logMissingFileIds } from "@lib/ai/extract-generated-files";
import { DEFAULT_MAX_AGENT_STEPS, getModelMaxTokens } from "@lib/ai/model-limits";
import { modelSupportsDocumentSkills } from "@lib/ai/document-skills-guard";
import { MCP_BETA } from "@lib/agents/mcp-connections";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";
import {
  addAnthropicUsage,
  applyCacheToHistoryMessages,
  applyCacheToTools,
  buildCachedSystem,
  emptyTokenUsage,
} from "@lib/ai/prompt-cache";
import {
  appendStepText,
  extractClientToolUses,
  extractInformativeServerToolCalls,
  maxStepsInterruptedNote,
} from "@lib/ai/client-tool-loop";

const MAX_PAUSE_TURN_CONTINUATIONS = 12;
const PROMPT_CACHING_BETA = "prompt-caching-2024-07-31";

function toAnthropicMessages(
  messages: ChatMessage[],
  containerUploadBlocks?: BetaContainerUploadBlockParam[]
): BetaMessageParam[] {
  const converted = messages.map((m, index) => {
    if (typeof m.content === "string") {
      const uploads =
        index === 0 && m.role === "user" && containerUploadBlocks?.length
          ? [...containerUploadBlocks, { type: "text" as const, text: m.content }]
          : m.content;
      return { role: m.role as "user" | "assistant", content: uploads };
    }
    return {
      role: m.role as "user" | "assistant",
      content: m.content.map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text! };
        if (block.type === "document") {
          return {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: block.source!.data,
            },
          };
        }
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: block.source!.media_type as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: block.source!.data,
          },
        };
      }),
    };
  });

  if (containerUploadBlocks?.length && converted.length > 0) {
    const first = converted[0];
    if (first.role === "user" && typeof first.content === "string") {
      converted[0] = {
        role: "user",
        content: [...containerUploadBlocks, { type: "text", text: first.content }],
      };
    }
  }

  return applyCacheToHistoryMessages(converted);
}

function extractText(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function buildBetas(options: { mcpServers?: BetaRequestMCPServerURLDefinition[]; createDocuments?: boolean }) {
  const betas = new Set<string>([...ANTHROPIC_DOCUMENT_BETAS, PROMPT_CACHING_BETA]);
  if (options.mcpServers?.length) betas.add(MCP_BETA);
  if (!options.createDocuments) {
    betas.delete("skills-2025-10-02");
  }
  return Array.from(betas);
}

function buildBetaTools(options: {
  createDocuments?: boolean;
  hasContainerUploads?: boolean;
  webSearch?: boolean;
  webSearchConfig?: Record<string, unknown>;
  clientTools?: ToolUnion[];
}): ToolUnion[] | undefined {
  const tools: ToolUnion[] = [...(options.clientTools ?? [])];
  const needsCodeExecution = Boolean(options.createDocuments || options.hasContainerUploads);

  if (options.createDocuments) {
    tools.push(...buildDocumentCreationTools(options.webSearch !== false, options.webSearchConfig));
  } else if (needsCodeExecution) {
    // container_upload blocks require code_execution even without native document skills
    tools.push(buildCodeExecutionTool());
    if (options.webSearch !== false) {
      tools.push(...buildAnthropicServerTools(["web_search"]));
    }
  } else if (options.webSearch !== false) {
    tools.push(...buildAnthropicServerTools(["web_search"]));
  }
  return tools.length ? applyCacheToTools(tools) : undefined;
}

async function executeBetaClientToolUses(
  registry: AgentToolRegistry,
  toolUses: ReturnType<typeof extractClientToolUses>
): Promise<{ executed: ExecutedToolCall[]; toolResults: BetaToolResultBlockParam[] }> {
  const executed: ExecutedToolCall[] = [];
  const toolResults: BetaToolResultBlockParam[] = [];

  for (const toolUse of toolUses) {
    const result = await registry.execute(
      toolUse.name,
      toolUse.input as Record<string, unknown>,
      toolUse.id
    );
    executed.push(result);
    toolResults.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: result.result,
      is_error: result.isError,
    });
  }

  return { executed, toolResults };
}

export interface BetaAgentRunOptions {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  webSearchConfig?: Record<string, unknown>;
  maxTokens?: number;
  maxSteps?: number;
  createDocuments?: boolean;
  documentSkillIds?: AnthropicDocumentSkillId[];
  mcpServers?: BetaRequestMCPServerURLDefinition[];
  containerUploadBlocks?: BetaContainerUploadBlockParam[];
  clientTools?: ToolUnion[];
  toolRegistry?: AgentToolRegistry;
}

export interface BetaAgentRunResult {
  content: string;
  usage: TokenUsage;
  anthropicFileIds: string[];
  stepsUsed: number;
  documentSkillsUsed?: AnthropicDocumentSkillId[];
  toolCalls?: ExecutedToolCall[];
  stopReason?: string;
}

async function createBetaResponse(
  client: Anthropic,
  options: BetaAgentRunOptions,
  messages: BetaMessageParam[]
) {
  const createDocuments = Boolean(options.createDocuments);
  const hasContainerUploads = Boolean(options.containerUploadBlocks?.length);
  const maxTokens =
    options.maxTokens ?? getModelMaxTokens(options.model, createDocuments);
  const betas = buildBetas({ mcpServers: options.mcpServers, createDocuments });
  const requestExtras = buildAnthropicRequestExtras({
    model: options.model,
    messages: options.messages,
    system: options.systemPrompt,
    temperature: options.temperature,
    effort: options.effort,
    thinkingEnabled: options.thinkingEnabled,
  });
  const skillIds =
    options.documentSkillIds?.length && createDocuments
      ? options.documentSkillIds
      : undefined;

  return client.beta.messages.create({
    model: options.model,
    max_tokens: maxTokens,
    system: buildCachedSystem(options.systemPrompt) ?? options.systemPrompt,
    messages,
    betas,
    ...(skillIds
      ? { container: { skills: buildDocumentSkillParams(skillIds) } }
      : {}),
    ...(options.mcpServers?.length ? { mcp_servers: options.mcpServers } : {}),
    tools: buildBetaTools({
      createDocuments,
      hasContainerUploads,
      webSearch: options.webSearch,
      webSearchConfig: options.webSearchConfig,
      clientTools: options.clientTools,
    }),
    ...requestExtras,
  });
}

async function runBetaAgentCore(options: BetaAgentRunOptions): Promise<BetaAgentRunResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages, options.containerUploadBlocks);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_AGENT_STEPS;
  const registry = options.toolRegistry;

  let usage = emptyTokenUsage();
  const collectedFileIds = new Set<string>();
  const executedTools: ExecutedToolCall[] = [];
  let stepsUsed = 0;
  let accumulatedContent = "";
  let stopReason: string | undefined;

  const documentSkillsUsed =
    options.documentSkillIds?.length && options.createDocuments
      ? options.documentSkillIds
      : options.createDocuments
        ? (["docx"] as AnthropicDocumentSkillId[])
        : undefined;

  for (let step = 0; step < maxSteps; step++) {
    stepsUsed += 1;
    let response: BetaMessage | null = null;

    for (let pause = 0; pause < MAX_PAUSE_TURN_CONTINUATIONS; pause++) {
      response = await createBetaResponse(client, options, messages);
      usage = addAnthropicUsage(usage, response.usage);
      extractFileIdsFromPayload(response.content).forEach((id) => collectedFileIds.add(id));
      executedTools.push(...extractInformativeServerToolCalls(response.content));

      if (response.stop_reason === "pause_turn") {
        accumulatedContent = appendStepText(accumulatedContent, extractText(response.content));
        messages = [...messages, { role: "assistant", content: response.content }];
        continue;
      }
      break;
    }

    if (!response) throw new Error("No response from Anthropic");

    accumulatedContent = appendStepText(accumulatedContent, extractText(response.content));
    logMissingFileIds("beta-run", response.content, accumulatedContent);

    const toolUses = extractClientToolUses(response.content);
    if (registry && toolUses.length > 0) {
      messages = [...messages, { role: "assistant", content: response.content }];
      const { executed, toolResults } = await executeBetaClientToolUses(registry, toolUses);
      executedTools.push(...executed);
      messages = [...messages, { role: "user", content: toolResults }];
      continue;
    }

    stopReason = response.stop_reason ?? undefined;
    break;
  }

  if (stepsUsed >= maxSteps && !stopReason) {
    accumulatedContent += maxStepsInterruptedNote(maxSteps);
    stopReason = "max_steps";
  }

  return {
    content: accumulatedContent,
    usage,
    anthropicFileIds: Array.from(collectedFileIds),
    stepsUsed,
    documentSkillsUsed,
    toolCalls: executedTools.length ? executedTools : undefined,
    stopReason,
  };
}

export async function runBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): Promise<BetaAgentRunResult> {
  if (options.createDocuments && !modelSupportsDocumentSkills(options.model)) {
    throw new Error("Model does not support document skills");
  }
  return runBetaAgentCore(options);
}

export type BetaAgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "mcp_tool"; name: string }
  | { type: "client_tool"; name: string; phase: "start" | "done"; result?: string }
  | { type: "anthropic_file_ids"; fileIds: string[] }
  | {
      type: "done";
      usage: TokenUsage;
      stepsUsed?: number;
      documentSkillsUsed?: AnthropicDocumentSkillId[];
      toolCalls?: ExecutedToolCall[];
      stopReason?: string;
    };

async function* streamBetaAgentCore(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages, options.containerUploadBlocks);
  const createDocuments = Boolean(options.createDocuments);
  const hasContainerUploads = Boolean(options.containerUploadBlocks?.length);
  const maxTokens =
    options.maxTokens ?? getModelMaxTokens(options.model, createDocuments);
  const betas = buildBetas({ mcpServers: options.mcpServers, createDocuments });
  const requestExtras = buildAnthropicRequestExtras({
    model: options.model,
    messages: options.messages,
    system: options.systemPrompt,
    temperature: options.temperature,
    effort: options.effort,
    thinkingEnabled: options.thinkingEnabled,
  });
  const skillIds =
    options.documentSkillIds?.length && createDocuments
      ? options.documentSkillIds
      : undefined;
  const documentSkillsUsed =
    skillIds ?? (createDocuments ? (["docx"] as AnthropicDocumentSkillId[]) : undefined);
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_AGENT_STEPS;
  const registry = options.toolRegistry;

  let usage = emptyTokenUsage();
  const collectedFileIds = new Set<string>();
  const executedTools: ExecutedToolCall[] = [];
  let stepsUsed = 0;
  let hadPriorStepText = false;
  let stopReason: string | undefined;

  for (let step = 0; step < maxSteps; step++) {
    stepsUsed += 1;
    let emittedTextThisStep = false;

    if (hadPriorStepText) {
      yield { type: "text", text: "\n\n" };
    }

    for (let pause = 0; pause < MAX_PAUSE_TURN_CONTINUATIONS; pause++) {
      const stream = client.beta.messages.stream({
        model: options.model,
        max_tokens: maxTokens,
        system: buildCachedSystem(options.systemPrompt) ?? options.systemPrompt,
        messages,
        betas,
        ...(skillIds
          ? { container: { skills: buildDocumentSkillParams(skillIds) } }
          : {}),
        ...(options.mcpServers?.length ? { mcp_servers: options.mcpServers } : {}),
        tools: buildBetaTools({
          createDocuments,
          hasContainerUploads,
          webSearch: options.webSearch,
          webSearchConfig: options.webSearchConfig,
          clientTools: options.clientTools,
        }),
        ...requestExtras,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emittedTextThisStep = true;
          hadPriorStepText = true;
          yield { type: "text", text: event.delta.text };
        }
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use") {
            yield { type: "server_tool", name: block.name };
          }
          if (block.type === "mcp_tool_use") {
            yield { type: "mcp_tool", name: block.name };
          }
        }
      }

      const final = await stream.finalMessage();
      usage = addAnthropicUsage(usage, final.usage);
      extractFileIdsFromPayload(final.content).forEach((id) => collectedFileIds.add(id));
      executedTools.push(...extractInformativeServerToolCalls(final.content));
      logMissingFileIds("beta-stream", final.content, extractText(final.content));

      if (final.stop_reason === "pause_turn") {
        if (!emittedTextThisStep) {
          const pauseText = extractText(final.content);
          if (pauseText) {
            emittedTextThisStep = true;
            hadPriorStepText = true;
            yield { type: "text", text: pauseText };
          }
        }
        messages = [...messages, { role: "assistant", content: final.content }];
        continue;
      }

      const toolUses = extractClientToolUses(final.content);
      if (registry && toolUses.length > 0) {
        messages = [...messages, { role: "assistant", content: final.content }];
        for (const toolUse of toolUses) {
          yield { type: "client_tool", name: toolUse.name, phase: "start" };
        }
        const { executed, toolResults } = await executeBetaClientToolUses(registry, toolUses);
        executedTools.push(...executed);
        for (const result of executed) {
          yield {
            type: "client_tool",
            name: result.name,
            phase: "done",
            result: result.result,
          };
        }
        messages = [...messages, { role: "user", content: toolResults }];
        break;
      }

      stopReason = final.stop_reason ?? undefined;
      break;
    }

    if (stopReason) break;
  }

  if (stepsUsed >= maxSteps && !stopReason) {
    yield { type: "text", text: maxStepsInterruptedNote(maxSteps) };
    stopReason = "max_steps";
  }

  const fileIds = Array.from(collectedFileIds);
  if (fileIds.length > 0) {
    yield { type: "anthropic_file_ids", fileIds };
  }

  yield {
    type: "done",
    usage,
    stepsUsed,
    documentSkillsUsed,
    toolCalls: executedTools.length ? executedTools : undefined,
    stopReason,
  };
}

export async function* streamBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  if (options.createDocuments && !modelSupportsDocumentSkills(options.model)) {
    yield { type: "text", text: "Modelo não suporta geração de documentos." };
    yield { type: "done", usage: emptyTokenUsage() };
    return;
  }
  yield* streamBetaAgentCore(options);
}

/** Beta path for MCP and/or skill container files without document skills. */
export async function runBetaAgentSession(options: BetaAgentRunOptions): Promise<BetaAgentRunResult> {
  return runBetaAgentCore({ ...options, createDocuments: options.createDocuments ?? false });
}

export async function* streamBetaAgentSession(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  yield* streamBetaAgentCore({ ...options, createDocuments: options.createDocuments ?? false });
}
