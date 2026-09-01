import type { BetaSkillParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ToolUnion, WebSearchTool20250305 } from "@anthropic-ai/sdk/resources/messages/messages";
import type { CustomContainerSkill } from "@lib/agent-skills/anthropic-custom-skills";

/** Anthropic-managed document creation skills (API). */
export const ANTHROPIC_DOCUMENT_SKILL_IDS = ["pptx", "xlsx", "docx", "pdf"] as const;
export type AnthropicDocumentSkillId = (typeof ANTHROPIC_DOCUMENT_SKILL_IDS)[number];

export const ANTHROPIC_DOCUMENT_BETAS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
] as const;

export type ContainerSkillParam = BetaSkillParams | CustomContainerSkill;

export function buildDocumentSkillParams(
  skillIds: AnthropicDocumentSkillId[] = [...ANTHROPIC_DOCUMENT_SKILL_IDS]
): ContainerSkillParam[] {
  return skillIds.map((skill_id) => ({
    type: "anthropic" as const,
    skill_id,
    version: "latest",
  }));
}

/** Merge native document skills + custom uploaded skills for container.skills. */
export function mergeContainerSkills(options: {
  documentSkillIds?: AnthropicDocumentSkillId[];
  createDocuments?: boolean;
  customSkills?: CustomContainerSkill[];
}): ContainerSkillParam[] | undefined {
  const skills: ContainerSkillParam[] = [];
  if (options.createDocuments && options.documentSkillIds?.length) {
    skills.push(...buildDocumentSkillParams(options.documentSkillIds));
  }
  if (options.customSkills?.length) {
    skills.push(...options.customSkills);
  }
  return skills.length ? skills : undefined;
}

export function buildCodeExecutionTool(): ToolUnion {
  return {
    type: "code_execution_20250825",
    name: "code_execution",
  };
}

export function buildDocumentCreationTools(
  webSearch: boolean,
  webSearchConfig?: Record<string, unknown>
): ToolUnion[] {
  const tools: ToolUnion[] = [buildCodeExecutionTool()];

  if (webSearch) {
    const webSearchTool: WebSearchTool20250305 = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: typeof webSearchConfig?.max_uses === "number" ? webSearchConfig.max_uses : 5,
    };
    if (Array.isArray(webSearchConfig?.allowed_domains) && webSearchConfig.allowed_domains.length > 0) {
      webSearchTool.allowed_domains = webSearchConfig.allowed_domains as string[];
    }
    if (Array.isArray(webSearchConfig?.blocked_domains) && webSearchConfig.blocked_domains.length > 0) {
      webSearchTool.blocked_domains = webSearchConfig.blocked_domains as string[];
    }
    tools.push(webSearchTool);
  }

  return tools;
}

export const DOCUMENT_CREATION_SYSTEM_HINT = `
Quando o utilizador pedir ficheiros (PowerPoint, Excel, Word, PDF), usa code execution para os criar e grava em /mnt/user-data/outputs/.
O download só fica disponível quando o ficheiro é exportado pelo sandbox com file_id — aparece automaticamente como botão verde abaixo da mensagem.
Nunca inventes listas de ficheiros "disponíveis para download" em markdown se o botão de download ainda não existir.
Não digas que não consegues criar ficheiros — tens code execution activo.`;
