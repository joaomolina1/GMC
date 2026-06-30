import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContainerUploadBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaRequestMCPServerURLDefinition,
  BetaTextBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import type { ChatMessage, EffortLevel, TokenUsage } from "@lib/ai/types";
import { buildAnthropicRequestExtras } from "@lib/ai/anthropic-params";
import {
  ANTHROPIC_DOCUMENT_BETAS,
  type AnthropicDocumentSkillId,
  buildDocumentCreationTools,
  buildDocumentSkillParams,
} from "@lib/ai/anthropic-document-skills";
import { extractFileIdsFromPayload, logMissingFileIds } from "@lib/ai/extract-generated-files";
import { getModelMaxTokens } from "@lib/ai/model-limits";
import { modelSupportsDocumentSkills } from "@lib/ai/document-skills-guard";
import { MCP_BETA } from "@lib/agents/mcp-connections";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";
import {
  addAnthropicUsage,
  applyCacheToTools,
  buildCachedSystem,
  emptyTokenUsage,
} from "@lib/ai/prompt-cache";

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

  return converted;
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
  webSearch?: boolean;
  webSearchConfig?: Record<string, unknown>;
  clientTools?: ToolUnion[];
}): ToolUnion[] | undefined {
  const tools: ToolUnion[] = [...(options.clientTools ?? [])];
  if (options.createDocuments) {
    tools.push(...buildDocumentCreationTools(options.webSearch !== false, options.webSearchConfig));
  } else if (options.webSearch !== false) {
    tools.push(...buildAnthropicServerTools(["web_search"]));
  }
  return tools.length ? applyCacheToTools(tools) : undefined;
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
  createDocuments?: boolean;
  documentSkillIds?: AnthropicDocumentSkillId[];
  mcpServers?: BetaRequestMCPServerURLDefinition[];
  containerUploadBlocks?: BetaContainerUploadBlockParam[];
  clientTools?: ToolUnion[];
}

export interface BetaAgentRunResult {
  content: string;
  usage: TokenUsage;
  anthropicFileIds: string[];
  stepsUsed: number;
  documentSkillsUsed?: AnthropicDocumentSkillId[];
}

async function createBetaResponse(
  client: Anthropic,
  options: BetaAgentRunOptions,
  messages: BetaMessageParam[]
) {
  const createDocuments = Boolean(options.createDocuments);
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
    ...(createDocuments
      ? { container: { skills: buildDocumentSkillParams(skillIds) } }
      : {}),
    ...(options.mcpServers?.length ? { mcp_servers: options.mcpServers } : {}),
    tools: buildBetaTools({
      createDocuments,
      webSearch: options.webSearch,
      webSearchConfig: options.webSearchConfig,
      clientTools: options.clientTools,
    }),
    ...requestExtras,
  });
}

export async function runBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): Promise<BetaAgentRunResult> {
  if (options.createDocuments && !modelSupportsDocumentSkills(options.model)) {
    throw new Error("Model does not support document skills");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages, options.containerUploadBlocks);

  let usage = emptyTokenUsage();
  let response: BetaMessage | null = null;
  const collectedFileIds = new Set<string>();
  let stepsUsed = 0;
  const documentSkillsUsed =
    options.documentSkillIds?.length && options.createDocuments
      ? options.documentSkillIds
      : options.createDocuments
        ? (["docx"] as AnthropicDocumentSkillId[])
        : undefined;

  for (let i = 0; i < MAX_PAUSE_TURN_CONTINUATIONS; i++) {
    stepsUsed += 1;
    response = await createBetaResponse(client, options, messages);

    usage = addAnthropicUsage(usage, response.usage);
    extractFileIdsFromPayload(response.content).forEach((id) => collectedFileIds.add(id));
    logMissingFileIds("beta-run", response.content, extractText(response.content));

    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }
    break;
  }

  if (!response) throw new Error("No response from Anthropic");

  return {
    content: extractText(response.content),
    usage,
    anthropicFileIds: Array.from(collectedFileIds),
    stepsUsed,
    documentSkillsUsed,
  };
}

export type BetaAgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "mcp_tool"; name: string }
  | { type: "anthropic_file_ids"; fileIds: string[] }
  | { type: "done"; usage: TokenUsage; stepsUsed?: number; documentSkillsUsed?: AnthropicDocumentSkillId[] };

export async function* streamBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  if (options.createDocuments && !modelSupportsDocumentSkills(options.model)) {
    yield { type: "text", text: "Modelo não suporta geração de documentos." };
    yield { type: "done", usage: emptyTokenUsage() };
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages, options.containerUploadBlocks);
  const createDocuments = Boolean(options.createDocuments);
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

  let usage = emptyTokenUsage();
  const collectedFileIds = new Set<string>();
  let stepsUsed = 0;

  for (let turn = 0; turn < MAX_PAUSE_TURN_CONTINUATIONS; turn++) {
    stepsUsed += 1;
    const stream = client.beta.messages.stream({
      model: options.model,
      max_tokens: maxTokens,
      system: buildCachedSystem(options.systemPrompt) ?? options.systemPrompt,
      messages,
      betas,
      ...(createDocuments
        ? { container: { skills: buildDocumentSkillParams(skillIds) } }
        : {}),
      ...(options.mcpServers?.length ? { mcp_servers: options.mcpServers } : {}),
      tools: buildBetaTools({
        createDocuments,
        webSearch: options.webSearch,
        webSearchConfig: options.webSearchConfig,
        clientTools: options.clientTools,
      }),
      ...requestExtras,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
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
    logMissingFileIds("beta-stream", final.content, extractText(final.content));

    if (final.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: final.content }];
      continue;
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
    };
    return;
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
  };
}

/** Beta path for MCP and/or skill container files without document skills. */
export async function runBetaAgentSession(options: BetaAgentRunOptions): Promise<BetaAgentRunResult> {
  return runBetaAgentWithDocuments({ ...options, createDocuments: options.createDocuments ?? false });
}

export async function* streamBetaAgentSession(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  yield* streamBetaAgentWithDocuments({ ...options, createDocuments: options.createDocuments ?? false });
}
