import { getProvider, computeModelCost } from "@lib/ai/registry";
import type { ChatMessage, ToolCall } from "@lib/ai/types";
import { logAudit } from "@lib/audit";
import { resolveAgentSkills, getSkill, PLUGIN_SKILL_KEYS } from "./registry";
import { toToolDefinition, type SkillContext } from "./types";

export interface AgentRunConfig {
  model: string;
  systemPrompt: string;
  temperature: number;
  skills: Array<string | { key: string; enabled?: boolean }>;
  skillConfigs?: Record<string, Record<string, unknown>>;
}

export interface RunAgentOptions {
  config: AgentRunConfig;
  messages: ChatMessage[];
  ctx: SkillContext;
  maxIterations?: number;
  onText?: (text: string) => void;
}

export interface RunAgentResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number };
  costEur: number;
  toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }>;
}

export async function runAgentLoop(options: RunAgentOptions): Promise<RunAgentResult> {
  const { config, messages, ctx, maxIterations = 10, onText } = options;
  const enrichedCtx: SkillContext = {
    ...ctx,
    skillConfigs: config.skillConfigs ?? ctx.skillConfigs,
  };
  const skills = resolveAgentSkills(config.skills);
  const tools = skills.map(toToolDefinition);
  const provider = getProvider(config.model);

  let currentMessages = [...messages];
  let totalPrompt = 0;
  let totalCompletion = 0;
  const toolCallLog: RunAgentResult["toolCalls"] = [];
  let finalContent = "";

  for (let i = 0; i < maxIterations; i++) {
    const result = await provider.generate({
      model: config.model,
      system: config.systemPrompt,
      temperature: config.temperature,
      messages: currentMessages,
      tools: tools.length > 0 ? tools : undefined,
    });

    totalPrompt += result.usage.promptTokens;
    totalCompletion += result.usage.completionTokens;

    if (result.toolCalls && result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        const skillResult = await executeToolCall(tc, enrichedCtx);
        toolCallLog.push({ name: tc.name, input: tc.input, result: skillResult });
        currentMessages.push({
          role: "assistant",
          content: `[Used tool: ${tc.name}]`,
        });
        currentMessages.push({
          role: "user",
          content: `Tool result for ${tc.name}:\n${skillResult}`,
        });
      }
      continue;
    }

    finalContent = result.content;
    onText?.(result.content);
    break;
  }

  const costEur = computeModelCost(config.model, {
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
  });

  return {
    content: finalContent,
    usage: { promptTokens: totalPrompt, completionTokens: totalCompletion },
    costEur,
    toolCalls: toolCallLog,
  };
}

export async function* streamAgentLoop(
  options: RunAgentOptions
): AsyncGenerator<
  | { type: "text"; text: string }
  | { type: "tool"; name: string; result: string }
  | { type: "done"; usage: { promptTokens: number; completionTokens: number }; costEur: number }
> {
  const { config, messages, ctx, maxIterations = 10 } = options;
  const enrichedCtx: SkillContext = {
    ...ctx,
    skillConfigs: config.skillConfigs ?? ctx.skillConfigs,
  };
  const skills = resolveAgentSkills(config.skills);
  const tools = skills.map(toToolDefinition);
  const provider = getProvider(config.model);

  let currentMessages = [...messages];
  let totalPrompt = 0;
  let totalCompletion = 0;

  for (let i = 0; i < maxIterations; i++) {
    let textBuffer = "";
    let toolCalls: ToolCall[] = [];

    for await (const chunk of provider.stream({
      model: config.model,
      system: config.systemPrompt,
      temperature: config.temperature,
      messages: currentMessages,
      tools: tools.length > 0 ? tools : undefined,
    })) {
      if (chunk.type === "text" && chunk.text) {
        textBuffer += chunk.text;
        yield { type: "text", text: chunk.text };
      }
      if (chunk.type === "tool_use" && chunk.toolCall) {
        toolCalls.push(chunk.toolCall);
      }
      if (chunk.type === "done" && chunk.usage) {
        totalPrompt += chunk.usage.promptTokens;
        totalCompletion += chunk.usage.completionTokens;
      }
    }

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const result = await executeToolCall(tc, enrichedCtx);
        yield { type: "tool", name: tc.name, result };
        currentMessages.push({ role: "assistant", content: `[Used tool: ${tc.name}]` });
        currentMessages.push({ role: "user", content: `Tool result for ${tc.name}:\n${result}` });
      }
      continue;
    }

    const costEur = computeModelCost(config.model, {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
    });
    yield { type: "done", usage: { promptTokens: totalPrompt, completionTokens: totalCompletion }, costEur };
    return;
  }
}

async function executeToolCall(
  toolCall: ToolCall,
  ctx: SkillContext
): Promise<string> {
  const skill = getSkill(toolCall.name);
  if (!skill) return `Unknown skill: ${toolCall.name}`;
  try {
    const result = await skill.execute(toolCall.input, ctx);
    if (PLUGIN_SKILL_KEYS.includes(toolCall.name)) {
      await logAudit(ctx.supabase, {
        actorId: ctx.userId,
        action: `skill.${toolCall.name}`,
        entityType: "agent",
        entityId: ctx.agentId,
        metadata: {
          conversationId: ctx.conversationId,
          inputKeys: Object.keys(toolCall.input),
        },
      });
    }
    return result;
  } catch (err) {
    return `Skill error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}
