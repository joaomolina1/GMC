import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ChatMessage, EffortLevel } from "@lib/ai/types";
import { buildAnthropicRequestExtras } from "@lib/ai/anthropic-params";
import {
  ANTHROPIC_DOCUMENT_BETAS,
  buildDocumentCreationTools,
  buildDocumentSkillParams,
} from "@lib/ai/anthropic-document-skills";
import { extractFileIdsFromPayload } from "@lib/ai/extract-generated-files";

const MAX_PAUSE_TURN_CONTINUATIONS = 12;
const DOCUMENT_MAX_TOKENS = 16384;

function toAnthropicMessages(messages: ChatMessage[]): BetaMessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role as "user" | "assistant", content: m.content };
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
}

function extractText(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
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
}

export interface BetaAgentRunResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  anthropicFileIds: string[];
}

export async function runBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): Promise<BetaAgentRunResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages);
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const requestExtras = buildAnthropicRequestExtras({
    model: options.model,
    messages: options.messages,
    system: options.systemPrompt,
    temperature: options.temperature,
    effort: options.effort,
    thinkingEnabled: options.thinkingEnabled,
  });

  let totalPrompt = 0;
  let totalCompletion = 0;
  let response: BetaMessage | null = null;
  const collectedFileIds = new Set<string>();

  for (let i = 0; i < MAX_PAUSE_TURN_CONTINUATIONS; i++) {
    response = await client.beta.messages.create({
      model: options.model,
      max_tokens: DOCUMENT_MAX_TOKENS,
      system: options.systemPrompt,
      messages,
      betas,
      container: { skills: buildDocumentSkillParams() },
      tools: buildDocumentCreationTools(options.webSearch !== false, options.webSearchConfig),
      ...requestExtras,
    });

    totalPrompt += response.usage.input_tokens;
    totalCompletion += response.usage.output_tokens;
    extractFileIdsFromPayload(response.content).forEach((id) => collectedFileIds.add(id));

    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }
    break;
  }

  if (!response) throw new Error("No response from Anthropic");

  return {
    content: extractText(response.content),
    usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    anthropicFileIds: Array.from(collectedFileIds),
  };
}

export type BetaAgentStreamEvent =
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "anthropic_file_ids"; fileIds: string[] }
  | { type: "done"; usage: { promptTokens: number; completionTokens: number } };

export async function* streamBetaAgentWithDocuments(
  options: BetaAgentRunOptions
): AsyncGenerator<BetaAgentStreamEvent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let messages = toAnthropicMessages(options.messages);
  const betas = [...ANTHROPIC_DOCUMENT_BETAS];
  const requestExtras = buildAnthropicRequestExtras({
    model: options.model,
    messages: options.messages,
    system: options.systemPrompt,
    temperature: options.temperature,
    effort: options.effort,
    thinkingEnabled: options.thinkingEnabled,
  });

  let totalPrompt = 0;
  let totalCompletion = 0;
  const collectedFileIds = new Set<string>();

  for (let turn = 0; turn < MAX_PAUSE_TURN_CONTINUATIONS; turn++) {
    const stream = client.beta.messages.stream({
      model: options.model,
      max_tokens: DOCUMENT_MAX_TOKENS,
      system: options.systemPrompt,
      messages,
      betas,
      container: { skills: buildDocumentSkillParams() },
      tools: buildDocumentCreationTools(options.webSearch !== false, options.webSearchConfig),
      ...requestExtras,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        yield { type: "server_tool", name: event.content_block.name };
      }
    }

    const final = await stream.finalMessage();
    totalPrompt += final.usage.input_tokens;
    totalCompletion += final.usage.output_tokens;
    extractFileIdsFromPayload(final.content).forEach((id) => collectedFileIds.add(id));

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
      usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    };
    return;
  }

  const fileIds = Array.from(collectedFileIds);
  if (fileIds.length > 0) {
    yield { type: "anthropic_file_ids", fileIds };
  }

  yield {
    type: "done",
    usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
  };
}
