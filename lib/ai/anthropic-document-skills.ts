import type { BetaSkillParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ToolUnion, WebSearchTool20250305 } from "@anthropic-ai/sdk/resources/messages/messages";

/** Anthropic-managed document creation skills (API). */
export const ANTHROPIC_DOCUMENT_SKILL_IDS = ["pptx", "xlsx", "docx", "pdf"] as const;
export type AnthropicDocumentSkillId = (typeof ANTHROPIC_DOCUMENT_SKILL_IDS)[number];

export const ANTHROPIC_DOCUMENT_BETAS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
] as const;

export function buildDocumentSkillParams(
  skillIds: AnthropicDocumentSkillId[] = [...ANTHROPIC_DOCUMENT_SKILL_IDS]
): BetaSkillParams[] {
  return skillIds.map((skill_id) => ({
    type: "anthropic" as const,
    skill_id,
    version: "latest",
  }));
}

export function buildDocumentCreationTools(
  webSearch: boolean,
  webSearchConfig?: Record<string, unknown>
): ToolUnion[] {
  const tools: ToolUnion[] = [
    {
      type: "code_execution_20250825",
      name: "code_execution",
    },
  ];

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
Quando o utilizador pedir ficheiros (PowerPoint, Excel, Word, PDF), usa as skills disponíveis para os criar.
Depois de gerar o ficheiro, confirma o que foi criado e indica que o download está disponível na conversa.
Não digas que não consegues criar ficheiros — tens code execution e skills de documentos activas.`;
