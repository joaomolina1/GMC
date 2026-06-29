import type { EffortLevel, ChatMessage } from "@lib/ai/types";
import { getProvider, computeModelCost } from "@lib/ai/registry";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  /** Anthropic native web search — enabled by default */
  webSearch?: boolean;
}

function buildProviderOptions(config: AgentConfig, messages: ChatMessage[]) {
  const webSearch = config.webSearch !== false;
  const serverTools = webSearch ? buildAnthropicServerTools(["web_search"]) : [];

  return {
    model: config.model,
    system: config.systemPrompt,
    temperature: config.temperature,
    effort: config.effort,
    thinkingEnabled: config.thinkingEnabled,
    messages,
    nativeTools: serverTools.length > 0 ? serverTools : undefined,
  };
}

export interface RunAgentResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  costEur: number;
}

export async function runAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): Promise<RunAgentResult> {
  const provider = getProvider(config.model);
  const result = await provider.generate(buildProviderOptions(config, messages));

  const costEur = computeModelCost(config.model, {
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  });

  return {
    content: result.content,
    usage: result.usage,
    costEur,
  };
}

export async function* streamAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): AsyncGenerator<
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "done"; usage: { promptTokens: number; completionTokens: number }; costEur: number }
> {
  const provider = getProvider(config.model);
  let totalPrompt = 0;
  let totalCompletion = 0;

  for await (const chunk of provider.stream(buildProviderOptions(config, messages))) {
    if (chunk.type === "text" && chunk.text) {
      yield { type: "text", text: chunk.text };
    }
    if (chunk.type === "server_tool" && chunk.serverToolName) {
      yield { type: "server_tool", name: chunk.serverToolName };
    }
    if (chunk.type === "done" && chunk.usage) {
      totalPrompt += chunk.usage.promptTokens;
      totalCompletion += chunk.usage.completionTokens;
    }
  }

  const costEur = computeModelCost(config.model, {
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
  });

  yield {
    type: "done",
    usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    costEur,
  };
}
