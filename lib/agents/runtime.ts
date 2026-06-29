import type { SupabaseClient } from "@supabase/supabase-js";
import { streamAgent, runAgent, toGeneratedFileRefs } from "@lib/chat/agent";
import { buildAgentSkillsPrompt } from "@lib/agent-skills/prompt";
import { buildKnowledgeContext } from "@lib/chat/rag";
import { DOCUMENT_CREATION_SYSTEM_HINT } from "@lib/ai/anthropic-document-skills";
import {
  isCreateDocumentsEnabled,
  isWebSearchEnabled,
} from "@lib/agents/agent-tools";
import { persistAnthropicGeneratedFiles } from "@lib/ai/persist-generated-files";
import type { ChatMessage } from "@lib/ai/types";

export interface AgentRuntimeConfig {
  model: string;
  systemPrompt: string;
  temperature?: number;
  effort?: "low" | "medium" | "high" | "max";
  thinkingEnabled?: boolean;
  webSearch: boolean;
  createDocuments: boolean;
  webSearchConfig?: Record<string, unknown>;
}

export async function buildAgentRuntimeConfig(options: {
  supabase: SupabaseClient;
  agentId: string;
  version: Record<string, unknown>;
  userMessage?: string;
}): Promise<AgentRuntimeConfig> {
  const { supabase, agentId, version, userMessage } = options;
  const skills = version.skills;
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

  const knowledgeContext =
    userMessage != null
      ? await buildKnowledgeContext(supabase, agentId, userMessage)
      : "";

  const createDocuments = isCreateDocumentsEnabled(skills);
  const parts = [String(version.system_prompt ?? ""), skillsPrompt, knowledgeContext];
  if (createDocuments) parts.push(DOCUMENT_CREATION_SYSTEM_HINT);

  return {
    model: String(version.model ?? "claude-sonnet-4-6"),
    systemPrompt: parts.filter(Boolean).join(""),
    temperature: version.temperature != null ? Number(version.temperature) : undefined,
    effort: (version.effort as AgentRuntimeConfig["effort"]) ?? "medium",
    thinkingEnabled: Boolean(version.thinking_enabled),
    webSearch: isWebSearchEnabled(skills),
    createDocuments,
    webSearchConfig:
      (version.tools as Record<string, Record<string, unknown>> | undefined)?.web_search,
  };
}

export async function persistAgentGeneratedFiles(options: {
  fileIds: string[];
  userId: string;
  supabase: SupabaseClient;
}) {
  if (!options.fileIds.length) return [];
  const persisted = await persistAnthropicGeneratedFiles(options);
  return toGeneratedFileRefs(persisted);
}

export { streamAgent, runAgent };

export type { ChatMessage };
