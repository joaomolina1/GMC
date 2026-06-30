export interface MessageContent {
  type: "text" | "image" | "document";
  text?: string;
  title?: string;
  source?: { type: "base64"; media_type: string; data: string };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | MessageContent[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type EffortLevel = "low" | "medium" | "high" | "max";

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  system?: string;
  /** @deprecated Prefer effort on supported models */
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  maxTokens?: number;
  maxSteps?: number;
  /** Anthropic native server tools (e.g. web_search). */
  nativeTools?: import("@anthropic-ai/sdk/resources/messages/messages").ToolUnion[];
  /** Client-side tool registry for custom tool execution loop. */
  toolRegistry?: import("@lib/agents/tool-runtime").AgentToolRegistry;
}

export interface GenerateResult {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  model: string;
  stopReason?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface StreamChunk {
  type: "text" | "tool_use" | "tool_result" | "server_tool" | "done";
  text?: string;
  toolCall?: ToolCall;
  serverToolName?: string;
  usage?: TokenUsage;
  executedTools?: ToolCall[];
}

export interface EmbedOptions {
  model?: string;
  input: string | string[];
}

export interface EmbedResult {
  embeddings: number[][];
  usage: { totalTokens: number };
}

export interface VisionOptions {
  model: string;
  image: { mediaType: string; data: string };
  prompt: string;
  maxTokens?: number;
}

export interface AIProvider {
  name: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream(options: GenerateOptions): AsyncGenerator<StreamChunk>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
  vision(options: VisionOptions): Promise<GenerateResult>;
}

export interface ModelPricing {
  inputPricePerMtok: number;
  outputPricePerMtok: number;
}

export function calculateCost(
  usage: TokenUsage,
  pricing: ModelPricing
): number {
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputPricePerMtok;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPricePerMtok;
  return inputCost + outputCost;
}
