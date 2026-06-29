export interface MessageContent {
  type: "text" | "image";
  text?: string;
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

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
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
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamChunk {
  type: "text" | "tool_use" | "done";
  text?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
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
