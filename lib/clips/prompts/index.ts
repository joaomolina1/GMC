/**
 * Registry de prompts versionados do módulo de clips.
 *
 * Desvio deliberado: ficheiros `.ts` em vez de `.md` — `.md` não é importável no bundle
 * da Next sem loader, e a app e o worker precisam exatamente do mesmo texto. Continuam
 * versionados em git; o teste de snapshot obriga a bump de `version` quando o texto muda.
 */
import { candidateSelectionPrompt } from "./candidate-selection";
import { visualValidationPrompt } from "./visual-validation";
import type { ClipPrompt } from "./types";

export type { BuiltPrompt, ClipPrompt } from "./types";
export { candidateSelectionPrompt } from "./candidate-selection";
export type { CandidateSelectionInput } from "./candidate-selection";
export { visualValidationPrompt } from "./visual-validation";
export type { VisualValidationInput } from "./visual-validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CLIP_PROMPTS: Record<string, ClipPrompt<any>> = {
  [candidateSelectionPrompt.id]: candidateSelectionPrompt,
  [visualValidationPrompt.id]: visualValidationPrompt,
};

export function getClipPrompt(id: string): ClipPrompt<unknown> {
  const prompt = CLIP_PROMPTS[id];
  if (!prompt) throw new Error(`Prompt desconhecido: ${id}`);
  return prompt;
}
