import type { EffortLevel, ChatMessage } from "@lib/ai/types";
import { getProvider, computeModelCost } from "@lib/ai/registry";
import { buildAnthropicServerTools } from "@lib/ai/anthropic-server-tools";
import { DOCUMENT_CREATION_SYSTEM_HINT } from "@lib/ai/anthropic-document-skills";
import {
  runBetaAgentWithDocuments,
  streamBetaAgentWithDocuments,
} from "@lib/ai/anthropic-beta-runner";
import type { PersistedGeneratedFile } from "@lib/ai/persist-generated-files";

export interface AgentConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  effort?: EffortLevel;
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  createDocuments?: boolean;
  webSearchConfig?: Record<string, unknown>;
}

export interface GeneratedFileRef {
  filename: string;
  mime: string;
  size: number;
  storage_path: string;
  download_url: string;
  file_id?: string;
}

export interface RunAgentResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  costEur: number;
  generatedFiles?: GeneratedFileRef[];
  anthropicFileIds?: string[];
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

function withDocumentHint(systemPrompt: string, createDocuments: boolean): string {
  if (!createDocuments) return systemPrompt;
  return `${systemPrompt}${DOCUMENT_CREATION_SYSTEM_HINT}`;
}

export async function runAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): Promise<RunAgentResult> {
  const systemPrompt = withDocumentHint(config.systemPrompt, Boolean(config.createDocuments));

  if (config.createDocuments) {
    const result = await runBetaAgentWithDocuments({
      model: config.model,
      systemPrompt,
      messages,
      temperature: config.temperature,
      effort: config.effort,
      thinkingEnabled: config.thinkingEnabled,
      webSearch: config.webSearch,
      webSearchConfig: config.webSearchConfig,
    });

    const costEur = computeModelCost(config.model, result.usage);
    return {
      content: result.content,
      usage: result.usage,
      costEur,
      anthropicFileIds: result.anthropicFileIds,
    };
  }

  const provider = getProvider(config.model);
  const result = await provider.generate(buildProviderOptions({ ...config, systemPrompt }, messages));
  const costEur = computeModelCost(config.model, result.usage);

  return {
    content: result.content,
    usage: result.usage,
    costEur,
  };
}

export type StreamAgentEvent =
  | { type: "text"; text: string }
  | { type: "server_tool"; name: string }
  | { type: "anthropic_file_ids"; fileIds: string[] }
  | { type: "generated_files"; files: GeneratedFileRef[] }
  | { type: "done"; usage: { promptTokens: number; completionTokens: number }; costEur: number };

export async function* streamAgent(
  config: AgentConfig,
  messages: ChatMessage[]
): AsyncGenerator<StreamAgentEvent> {
  const systemPrompt = withDocumentHint(config.systemPrompt, Boolean(config.createDocuments));

  if (config.createDocuments) {
    let totalPrompt = 0;
    let totalCompletion = 0;

    for await (const chunk of streamBetaAgentWithDocuments({
      model: config.model,
      systemPrompt,
      messages,
      temperature: config.temperature,
      effort: config.effort,
      thinkingEnabled: config.thinkingEnabled,
      webSearch: config.webSearch,
      webSearchConfig: config.webSearchConfig,
    })) {
      if (chunk.type === "text") yield chunk;
      if (chunk.type === "server_tool") yield chunk;
      if (chunk.type === "anthropic_file_ids") yield chunk;
      if (chunk.type === "done") {
        totalPrompt = chunk.usage.promptTokens;
        totalCompletion = chunk.usage.completionTokens;
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
    return;
  }

  const provider = getProvider(config.model);
  let totalPrompt = 0;
  let totalCompletion = 0;

  for await (const chunk of provider.stream(buildProviderOptions({ ...config, systemPrompt }, messages))) {
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

export function toGeneratedFileRefs(files: PersistedGeneratedFile[]): GeneratedFileRef[] {
  return files.map((f) => ({
    filename: f.filename,
    mime: f.mime,
    size: f.size,
    storage_path: f.storage_path,
    download_url: f.download_url,
    file_id: f.file_id,
  }));
}
