import type Anthropic from "@anthropic-ai/sdk";
import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import type { AgentToolRegistry, ExecutedToolCall } from "@lib/agents/tool-runtime";
import type { GenerateOptions, GenerateResult, StreamChunk, TokenUsage } from "@lib/ai/types";
import {
  addAnthropicUsage,
  applyCacheToHistoryMessages,
  applyCacheToTools,
  buildCachedSystem,
  emptyTokenUsage,
} from "@lib/ai/prompt-cache";
import {
  appendStepText,
  executeClientToolUses,
  extractClientToolUses,
  extractInformativeServerToolCalls,
  maxStepsInterruptedNote,
} from "@lib/ai/client-tool-loop";

const MAX_PAUSE_TURN_CONTINUATIONS = 8;

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function mergeTools(
  nativeTools: ToolUnion[] | undefined,
  clientTools: AgentToolRegistry["definitions"]
): ToolUnion[] | undefined {
  const merged = [...(nativeTools ?? []), ...clientTools];
  return merged.length > 0 ? merged : undefined;
}

export interface AgenticLoopOptions extends GenerateOptions {
  client: Anthropic;
  registry?: AgentToolRegistry;
  maxSteps?: number;
  requestExtras?: Record<string, unknown>;
}

export async function runAgenticGenerate(
  options: AgenticLoopOptions
): Promise<GenerateResult & { executedTools: ExecutedToolCall[] }> {
  const maxSteps = options.maxSteps ?? 12;
  const registry = options.registry;
  const tools = mergeTools(options.nativeTools, registry?.definitions ?? []);
  const cachedTools = tools ? applyCacheToTools(tools) : undefined;
  let messages = applyCacheToHistoryMessages(options.messages.map(toAnthropicMessage));
  let usage = emptyTokenUsage();
  const executedTools: ExecutedToolCall[] = [];
  let accumulatedContent = "";

  for (let step = 0; step < maxSteps; step++) {
    let response: Anthropic.Message | null = null;

    for (let pause = 0; pause < MAX_PAUSE_TURN_CONTINUATIONS; pause++) {
      response = await options.client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: buildCachedSystem(options.system) ?? options.system,
        messages,
        tools: cachedTools,
        ...options.requestExtras,
      } as Anthropic.MessageCreateParamsNonStreaming);

      usage = addAnthropicUsage(usage, response.usage);
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

    const toolUses = extractClientToolUses(response.content);

    if (!registry || toolUses.length === 0) {
      return {
        content: accumulatedContent,
        toolCalls: toolUses.length
          ? toolUses.map((b) => ({
              id: b.id,
              name: b.name,
              input: b.input as Record<string, unknown>,
            }))
          : undefined,
        usage,
        model: response.model,
        stopReason: response.stop_reason ?? undefined,
        executedTools,
      };
    }

    messages = [...messages, { role: "assistant", content: response.content }];

    const { executed, toolResults } = await executeClientToolUses(registry, toolUses);
    executedTools.push(...executed);
    messages = [...messages, { role: "user", content: toolResults }];
  }

  return {
    content: accumulatedContent + maxStepsInterruptedNote(maxSteps),
    usage,
    model: options.model,
    stopReason: "max_steps",
    executedTools,
  };
}

export async function* runAgenticStream(
  options: AgenticLoopOptions
): AsyncGenerator<StreamChunk & { executedTools?: ExecutedToolCall[] }> {
  const maxSteps = options.maxSteps ?? 12;
  const registry = options.registry;
  const tools = mergeTools(options.nativeTools, registry?.definitions ?? []);
  const cachedTools = tools ? applyCacheToTools(tools) : undefined;
  let messages = applyCacheToHistoryMessages(options.messages.map(toAnthropicMessage));
  let usage = emptyTokenUsage();
  const executedTools: ExecutedToolCall[] = [];
  let emittedTextThisStep = false;
  let hadPriorStepText = false;

  for (let step = 0; step < maxSteps; step++) {
    emittedTextThisStep = false;

    if (hadPriorStepText) {
      yield { type: "text", text: "\n\n" };
    }

    for (let pause = 0; pause < MAX_PAUSE_TURN_CONTINUATIONS; pause++) {
      const stream = options.client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: buildCachedSystem(options.system) ?? options.system,
        messages,
        tools: cachedTools,
        ...options.requestExtras,
      } as Anthropic.MessageCreateParamsStreaming);

      let currentTool: { id: string; name: string } | null = null;
      let toolInputJson = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            emittedTextThisStep = true;
            hadPriorStepText = true;
            yield { type: "text", text: event.delta.text };
          }
          if (event.delta.type === "input_json_delta") {
            toolInputJson += event.delta.partial_json;
          }
        }
        if (event.type === "content_block_start") {
          if (event.content_block.type === "server_tool_use") {
            yield { type: "server_tool", serverToolName: event.content_block.name };
          }
          if (event.content_block.type === "tool_use") {
            currentTool = { id: event.content_block.id, name: event.content_block.name };
            toolInputJson = "";
          }
        }
        if (event.type === "content_block_stop" && currentTool) {
          yield {
            type: "tool_use",
            toolCall: {
              id: currentTool.id,
              name: currentTool.name,
              input: JSON.parse(toolInputJson || "{}"),
            },
          };
          currentTool = null;
        }
      }

      const final = await stream.finalMessage();
      usage = addAnthropicUsage(usage, final.usage);
      executedTools.push(...extractInformativeServerToolCalls(final.content));

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

      if (!registry || toolUses.length === 0) {
        yield {
          type: "done",
          usage,
          executedTools,
        };
        return;
      }

      messages = [...messages, { role: "assistant", content: final.content }];

      const { executed, toolResults } = await executeClientToolUses(registry, toolUses);
      executedTools.push(...executed);

      for (const toolUse of toolUses) {
        yield {
          type: "tool_use",
          toolCall: {
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
          },
        };
      }

      for (const result of executed) {
        yield {
          type: "tool_result",
          toolCall: {
            id: result.id,
            name: result.name,
            input: result.input,
          },
          text: result.result,
        };
      }

      messages = [...messages, { role: "user", content: toolResults }];
      break;
    }
  }

  yield { type: "text", text: maxStepsInterruptedNote(maxSteps) };
  yield {
    type: "done",
    usage,
    executedTools,
  };
}

function toAnthropicMessage(m: GenerateOptions["messages"][number]): Anthropic.MessageParam {
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
          title: block.title ?? undefined,
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
}

export function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    cacheCreationTokens: (a.cacheCreationTokens ?? 0) + (b.cacheCreationTokens ?? 0),
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
  };
}
