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

function toAnthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role as "user" | "assistant", content: m.content };
    }
    return {
      role: m.role as "user" | "assistant",
      content: m.content.map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text! };
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: block.source!.media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: block.source!.data,
          },
        };
      }),
    };
  });
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: toAnthropicMessages(options.messages),
      tools: options.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      })),
    });

    let content = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") content += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      model: response.model,
      stopReason: response.stop_reason ?? undefined,
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const stream = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: toAnthropicMessages(options.messages),
      tools: options.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      })),
      stream: true,
    });

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
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        currentTool = { id: event.content_block.id, name: event.content_block.name };
        toolInputJson = "";
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
      if (event.type === "message_delta" && event.usage) {
        yield {
          type: "done",
          usage: {
            promptTokens: event.usage.output_tokens,
            completionTokens: event.usage.output_tokens,
          },
        };
      }
    }
    yield { type: "done" };
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

