import type { AnthropicDocumentSkillId } from "@lib/ai/anthropic-document-skills";

const FORMAT_HINTS: Array<{ skill: AnthropicDocumentSkillId; patterns: RegExp[] }> = [
  {
    skill: "pptx",
    patterns: [
      /\bpower\s*point\b/i,
      /\bpptx?\b/i,
      /\bapresenta[çc][ãa]o\b/i,
      /\bslides?\b/i,
    ],
  },
  {
    skill: "xlsx",
    patterns: [
      /\bexcel\b/i,
      /\bxlsx?\b/i,
      /\bfolha\s+de\s+c[aá]lculo\b/i,
      /\bspreadsheet\b/i,
    ],
  },
  {
    skill: "docx",
    patterns: [/\bword\b/i, /\bdocx?\b/i],
  },
  {
    skill: "pdf",
    patterns: [/\bpdf\b/i],
  },
];

const FILE_CREATION_HINTS = [
  /\b(cria[r]?|gera[r]?|faz(er)?|exporta[r]?|produz(ir)?)\b.{0,50}\b(ficheiro|fich\.|\.pptx|\.xlsx|\.docx|\.pdf)\b/i,
  /\b(cria[r]?|gera[r]?)\b.{0,30}\b(powerpoint|excel|word|pdf|apresenta[çc][ãa]o)\b/i,
  /\bexporta(r)?\s+para\s+(pdf|word|excel|powerpoint)\b/i,
];

/** Detect which document skills are needed for this user message. */
export function detectDocumentSkillsFromText(text: string): AnthropicDocumentSkillId[] {
  const detected = new Set<AnthropicDocumentSkillId>();
  for (const { skill, patterns } of FORMAT_HINTS) {
    if (patterns.some((p) => p.test(text))) detected.add(skill);
  }
  if (detected.size === 0) return [];
  return Array.from(detected);
}

/** Whether this turn should use the document-creation beta path. */
export function needsDocumentCreation(text: string): boolean {
  if (detectDocumentSkillsFromText(text).length > 0) return true;
  return FILE_CREATION_HINTS.some((p) => p.test(text));
}

/** Skills to load — defaults to docx when file intent is clear but format is ambiguous. */
export function resolveDocumentSkillsForTurn(text: string): AnthropicDocumentSkillId[] {
  const detected = detectDocumentSkillsFromText(text);
  if (detected.length > 0) return detected;
  if (needsDocumentCreation(text)) return ["docx"];
  return [];
}
