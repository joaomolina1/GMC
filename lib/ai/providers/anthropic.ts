import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ChatMessage,
  EmbedOptions,
  EmbedResult,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  ToolCall,
  VisionOptions,
} from "../types";
import { buildAnthropicRequestExtras } from "../anthropic-params";

const MAX_PAUSE_TURN_CONTINUATIONS = 8;

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
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
  });
}

function buildTools(options: GenerateOptions): ToolUnion[] | undefined {
  return options.nativeTools?.length ? options.nativeTools : undefined;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    let messages = toAnthropicMessages(options.messages);
    const tools = buildTools(options);
    let totalPrompt = 0;
    let totalCompletion = 0;
    let response: Anthropic.Message | null = null;

    const requestExtras = buildAnthropicRequestExtras(options);

    for (let i = 0; i < MAX_PAUSE_TURN_CONTINUATIONS; i++) {
      response = await this.client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.system,
        messages,
        tools,
        ...requestExtras,
      } as Anthropic.MessageCreateParamsNonStreaming);

      totalPrompt += response.usage.input_tokens;
      totalCompletion += response.usage.output_tokens;

      if (response.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: response.content }];
        continue;
      }
      break;
    }

    if (!response) {
      throw new Error("No response from Anthropic");
    }

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    return {
      content: extractText(response.content),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
      },
      model: response.model,
      stopReason: response.stop_reason ?? undefined,
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    let messages = toAnthropicMessages(options.messages);
    const tools = buildTools(options);
    let totalPrompt = 0;
    let totalCompletion = 0;
    const requestExtras = buildAnthropicRequestExtras(options);

    for (let turn = 0; turn < MAX_PAUSE_TURN_CONTINUATIONS; turn++) {
      const stream = this.client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.system,
        messages,
        tools,
        ...requestExtras,
      } as Anthropic.MessageCreateParamsStreaming);

      let currentTool: Partial<ToolCall> | null = null;
      let toolInputJson = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
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
              id: currentTool.id!,
              name: currentTool.name!,
              input: JSON.parse(toolInputJson || "{}"),
            },
          };
          currentTool = null;
        }
      }

      const final = await stream.finalMessage();
      totalPrompt += final.usage.input_tokens;
      totalCompletion += final.usage.output_tokens;

      if (final.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: final.content }];
        continue;
      }

      yield {
        type: "done",
        usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
      };
      return;
    }

    yield {
      type: "done",
      usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    };
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    const { getVoyageProvider, pseudoEmbedding } = await import("./voyage");
    const voyage = getVoyageProvider();
    if (voyage.isConfigured) {
      return voyage.embed(options);
    }
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    return {
      embeddings: inputs.map((text) => pseudoEmbedding(text, 1536)),
      usage: { totalTokens: inputs.join("").length / 4 },
    };
  }

  async vision(options: VisionOptions): Promise<GenerateResult> {
    return this.generate({
      model: options.model,
      maxTokens: options.maxTokens ?? 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: options.image.mediaType,
                data: options.image.data,
              },
            },
            { type: "text", text: options.prompt },
          ],
        },
      ],
    });
  }
}

