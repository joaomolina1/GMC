import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  EmbedOptions,
  EmbedResult,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  VisionOptions,
} from "../types";
import { buildAnthropicRequestExtras } from "../anthropic-params";
import { runAgenticGenerate, runAgenticStream } from "../agentic-loop";
import { getModelMaxTokens } from "../model-limits";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const requestExtras = buildAnthropicRequestExtras(options);
    const maxTokens = options.maxTokens ?? getModelMaxTokens(options.model);

    const result = await runAgenticGenerate({
      ...options,
      client: this.client,
      maxTokens,
      registry: options.toolRegistry,
      maxSteps: options.maxSteps,
      requestExtras,
    });

    return {
      content: result.content,
      toolCalls: result.executedTools.length
        ? result.executedTools.map((t) => ({
            id: t.id,
            name: t.name,
            input: t.input,
            result: t.result,
            isError: t.isError,
          }))
        : result.toolCalls,
      usage: result.usage,
      model: result.model,
      stopReason: result.stopReason,
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    const requestExtras = buildAnthropicRequestExtras(options);
    const maxTokens = options.maxTokens ?? getModelMaxTokens(options.model);

    for await (const chunk of runAgenticStream({
      ...options,
      client: this.client,
      maxTokens,
      registry: options.toolRegistry,
      maxSteps: options.maxSteps,
      requestExtras,
    })) {
      if (chunk.type === "done") {
        yield {
          type: "done",
          usage: chunk.usage,
          executedTools: chunk.executedTools?.map((t) => ({
            id: t.id,
            name: t.name,
            input: t.input,
            result: t.result,
            isError: t.isError,
          })),
        };
        return;
      }
      yield chunk;
    }
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
      maxTokens: options.maxTokens ?? getModelMaxTokens(options.model),
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
