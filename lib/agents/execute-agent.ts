import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage } from "@lib/ai/types";
import { runAgent } from "@lib/chat/agent";
import { buildKnowledgeContext } from "@lib/chat/rag";
import { buildAgentSkillsPrompt } from "@lib/agent-skills/prompt";
import { assertModelAllowedForUser } from "@lib/enterprise/role-policies";
import { logUsage } from "@lib/audit";

export function normalizeApiInput(input: unknown): string {
  if (input == null) {
    throw new Error("Campo 'input' é obrigatório");
  }
  if (typeof input === "string") {
    if (!input.trim()) throw new Error("Campo 'input' não pode estar vazio");
    return input.trim();
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) {
      const context =
        obj.context != null ? `\n\nContexto JSON:\n${JSON.stringify(obj.context, null, 2)}` : "";
      return `${obj.message.trim()}${context}`;
    }
    return JSON.stringify(input, null, 2);
  }
  return String(input);
}

export async function canAccessAgent(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  allowedAgentIds: string[] | null
): Promise<boolean> {
  if (allowedAgentIds && !allowedAgentIds.includes(agentId)) return false;

  const { data: agent } = await supabase
    .from("agents")
    .select("owner_id, visibility, status")
    .eq("id", agentId)
    .single();

  if (!agent || agent.status !== "published") return false;
  if (agent.owner_id === userId) return true;
  if (agent.visibility === "public") return true;
  return false;
}

export async function canAccessFlow(
  supabase: SupabaseClient,
  userId: string,
  flowId: string,
  allowedFlowIds: string[] | null
): Promise<boolean> {
  if (allowedFlowIds && !allowedFlowIds.includes(flowId)) return false;

  const { data: flow } = await supabase
    .from("flows")
    .select("owner_id")
    .eq("id", flowId)
    .single();

  if (!flow) return false;
  return flow.owner_id === userId;
}

export interface RunAgentApiOptions {
  supabase: SupabaseClient;
  userId: string;
  agentId: string;
  input: unknown;
  apiKeyId?: string;
}

export async function runAgentViaApi(options: RunAgentApiOptions) {
  const { supabase, userId, agentId, input, apiKeyId } = options;
  const message = normalizeApiInput(input);
  const start = Date.now();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, current_version_id")
    .eq("id", agentId)
    .single();

  if (!agent?.current_version_id) {
    throw new Error("Agente sem versão publicada");
  }

  const { data: version } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("id", agent.current_version_id)
    .single();

  if (!version) {
    throw new Error("Versão do agente não encontrada");
  }

  const modelCheck = await assertModelAllowedForUser(supabase, userId, version.model);
  if (!modelCheck.ok) {
    throw new Error(modelCheck.message);
  }

  const skillPackageIds = (version.skill_package_ids as string[]) ?? [];
  let skillsPrompt = "";
  if (skillPackageIds.length > 0) {
    const { data: skillPackages } = await supabase
      .from("agent_skill_packages")
      .select("id, name, description, skill_md, extra_files")
      .in("id", skillPackageIds);
    if (skillPackages?.length) {
      skillsPrompt = buildAgentSkillsPrompt(skillPackages);
    }
  }

  const knowledgeContext = await buildKnowledgeContext(supabase, agentId, message);
  const systemPrompt = [version.system_prompt, skillsPrompt, knowledgeContext]
    .filter(Boolean)
    .join("");

  const messages: ChatMessage[] = [{ role: "user", content: message }];

  const result = await runAgent(
    {
      model: version.model,
      systemPrompt,
      temperature: version.temperature != null ? Number(version.temperature) : undefined,
      effort: (version.effort as "low" | "medium" | "high" | "max") ?? "medium",
      thinkingEnabled: Boolean(version.thinking_enabled),
      webSearch: true,
    },
    messages
  );

  await logUsage(supabase, {
    userId,
    model: version.model,
    provider: "anthropic",
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    costEur: result.costEur,
    latencyMs: Date.now() - start,
    metadata: {
      agentId,
      apiKeyId,
      source: "api_v1",
    },
  });

  return {
    output: result.content,
    usage: {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
    },
    cost_eur: result.costEur,
    tool_calls: [],
  };
}
