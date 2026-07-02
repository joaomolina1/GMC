import type Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AgentToolRegistry, ExecutedToolCall } from "@lib/agents/tool-runtime";

export function maxStepsInterruptedNote(maxSteps: number): string {
  return `\n\n(interrompido: limite de ${maxSteps} passos atingido)`;
}

export function appendStepText(accumulated: string, stepText: string): string {
  if (!stepText.trim()) return accumulated;
  if (accumulated.trim()) return `${accumulated}\n\n${stepText}`;
  return stepText;
}

type ToolUseLike = { id: string; name: string; input: unknown };

export function extractClientToolUses(
  content: Anthropic.ContentBlock[] | BetaContentBlock[]
): ToolUseLike[] {
  return content
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }));
}

export function extractInformativeServerToolCalls(
  content: Anthropic.ContentBlock[] | BetaContentBlock[]
): ExecutedToolCall[] {
  const calls: ExecutedToolCall[] = [];

  for (const block of content) {
    if (block.type === "server_tool_use") {
      calls.push({
        id: block.id,
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
        result: "(execução server-side)",
        isError: false,
      });
    }
    if (block.type === "mcp_tool_use") {
      calls.push({
        id: block.id,
        name: `mcp:${block.name}`,
        input: (block.input as Record<string, unknown>) ?? {},
        result: "(execução MCP)",
        isError: false,
      });
    }
  }

  return calls;
}

export async function executeClientToolUses(
  registry: AgentToolRegistry,
  toolUses: ToolUseLike[]
): Promise<{
  executed: ExecutedToolCall[];
  toolResults: Anthropic.ToolResultBlockParam[];
}> {
  const executed: ExecutedToolCall[] = [];
  const toolResults: Anthropic.ToolResultBlockParam[] = [];

  for (const toolUse of toolUses) {
    const result = await registry.execute(
      toolUse.name,
      toolUse.input as Record<string, unknown>,
      toolUse.id
    );
    executed.push(result);
    toolResults.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: result.result,
      is_error: result.isError,
    });
  }

  return { executed, toolResults };
}
