import { getCatalogEntry } from "@lib/ai/anthropic-catalog";

/** Models that support Anthropic container skills (pptx/xlsx/docx/pdf). */
export function modelSupportsDocumentSkills(modelId: string): boolean {
  const entry = getCatalogEntry(modelId);
  if (!entry) return modelId.includes("claude-") && !modelId.includes("claude-3-");
  if (entry.status === "retired") return false;
  return entry.capabilities.includes("tools");
}

export const DOCUMENT_SKILLS_UNSUPPORTED_MESSAGE =
  "Este modelo não suporta geração de documentos (PowerPoint, Excel, Word, PDF). " +
  "Escolha Claude Sonnet 4.6, Opus 4.8 ou outro modelo com code execution e active a tool «Criar documentos».";

export const CREATE_DOCUMENTS_DISABLED_MESSAGE =
  "A tool «Criar documentos» está desactivada neste agente. Active-a no separador Tools do Builder " +
  "para gerar PowerPoint, Excel, Word ou PDF.";
