import type { SupabaseClient } from "@supabase/supabase-js";
import type { BetaRequestMCPServerURLDefinition } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaContainerUploadBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { streamAgent, runAgent, toGeneratedFileRefs } from "@lib/chat/agent";
import { buildAgentSkillsPrompt } from "@lib/agent-skills/prompt";
import {
  buildSkillContainerHint,
  persistSkillPackageFileCache,
  uploadSkillPackagesToContainer,
} from "@lib/agent-skills/container-files";
import {
  buildCustomContainerSkills,
  ensureAnthropicSkillIds,
  packagesMissingAnthropicId,
  type CustomContainerSkill,
} from "@lib/agent-skills/anthropic-custom-skills";
import { parseSkillPackageIds } from "@lib/agent-skills/ids";
import { buildKnowledgeContext } from "@lib/chat/rag";
import {
  agentToolsFromVersion,
  isCreateDocumentsEnabled,
  isWebSearchEnabled,
} from "@lib/agents/agent-tools";
import {
  buildAnthropicMcpServers,
  buildAnthropicMcpToolsets,
  loadAgentMcpConnections,
} from "@lib/agents/mcp-connections";
import type { BetaMCPToolset } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { persistAnthropicGeneratedFiles } from "@lib/ai/persist-generated-files";
import { DEFAULT_MAX_AGENT_STEPS } from "@lib/ai/model-limits";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";
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
  enabledTools: string[];
  maxSteps: number;
  agentId: string;
  userId?: string;
  supabase?: SupabaseClient;
  mcpServers?: BetaRequestMCPServerURLDefinition[];
  /** Required companion to mcpServers — one mcp_toolset per server name. */
  mcpToolsets?: BetaMCPToolset[];
  containerUploadBlocks?: BetaContainerUploadBlockParam[];
  customSkills?: CustomContainerSkill[];
  /** True when the agent version has at least one custom skill package. */
  hasAgentSkills?: boolean;
}

export async function buildAgentRuntimeConfig(options: {
  supabase: SupabaseClient;
  agentId: string;
  version: Record<string, unknown>;
  userMessage?: string;
  userId?: string;
  injectStaticRag?: boolean;
}): Promise<AgentRuntimeConfig> {
  const { supabase, agentId, version, userMessage, userId } = options;
  const skills = version.skills;
  const enabledTools = agentToolsFromVersion(skills);
  const createDocuments = isCreateDocumentsEnabled(skills);
  const skillPackageIds = parseSkillPackageIds(version.skill_package_ids);
  const injectStaticRag = options.injectStaticRag !== false;

  let skillsPrompt = "";
  let containerUploadBlocks: BetaContainerUploadBlockParam[] = [];
  let customSkills: CustomContainerSkill[] = [];
  let hasAgentSkills = false;

  if (skillPackageIds.length > 0) {
    const { data: skillPackages } = await supabase
      .from("agent_skill_packages")
      .select("id, name, description, skill_md, extra_files, anthropic_skill_id")
      .in("id", skillPackageIds);
    if (skillPackages?.length) {
      hasAgentSkills = true;
      const registered = await ensureAnthropicSkillIds(skillPackages, async (pkg) => {
        const { error } = await supabase
          .from("agent_skill_packages")
          .update({ anthropic_skill_id: pkg.anthropic_skill_id })
          .eq("id", pkg.id);
        if (error) throw new Error(error.message);
      });
      customSkills = buildCustomContainerSkills(registered);
      skillsPrompt = buildAgentSkillsPrompt(registered);

      const fallbackPackages = packagesMissingAnthropicId(registered);
      const hasExtraFiles = fallbackPackages.some((p) => (p.extra_files?.length ?? 0) > 0);
      if (fallbackPackages.length > 0 && (hasExtraFiles || createDocuments)) {
        const uploaded = await uploadSkillPackagesToContainer(fallbackPackages);
        containerUploadBlocks = uploaded.uploadBlocks;
        if (uploaded.fileIds.length > 0) {
          skillsPrompt += buildSkillContainerHint(uploaded.uploadedPaths, uploaded.skippedCount);
          void persistSkillPackageFileCache(supabase, uploaded.updatedPackages);
        }
      }
    }
  }

  const mcpConnections = await loadAgentMcpConnections(supabase, agentId);
  const mcpServers = buildAnthropicMcpServers(mcpConnections);
  const mcpToolsets = buildAnthropicMcpToolsets(mcpConnections);

  const useDynamicKnowledgeTool = enabledTools.includes("knowledge_search");
  const knowledgeContext =
    injectStaticRag && !useDynamicKnowledgeTool && userMessage != null
      ? await buildKnowledgeContext(supabase, agentId, userMessage)
      : "";

  const parts = [String(version.system_prompt ?? ""), skillsPrompt, knowledgeContext];

  const maxSteps =
    version.max_steps != null ? Number(version.max_steps) : DEFAULT_MAX_AGENT_STEPS;

  return {
    model: String(version.model ?? DEFAULT_AGENT_MODEL),
    systemPrompt: parts.filter(Boolean).join(""),
    temperature: version.temperature != null ? Number(version.temperature) : undefined,
    effort: (version.effort as AgentRuntimeConfig["effort"]) ?? "low",
    thinkingEnabled: version.thinking_enabled === true,
    webSearch: isWebSearchEnabled(skills),
    createDocuments,
    webSearchConfig:
      (version.tools as Record<string, Record<string, unknown>> | undefined)?.web_search,
    enabledTools,
    maxSteps: Number.isFinite(maxSteps) && maxSteps > 0 ? maxSteps : DEFAULT_MAX_AGENT_STEPS,
    agentId,
    userId,
    supabase,
    mcpServers: mcpServers.length ? mcpServers : undefined,
    mcpToolsets: mcpToolsets.length ? mcpToolsets : undefined,
    containerUploadBlocks: containerUploadBlocks.length ? containerUploadBlocks : undefined,
    customSkills: customSkills.length ? customSkills : undefined,
    hasAgentSkills: hasAgentSkills || undefined,
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
