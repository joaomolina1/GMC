import type { ClipPrompt } from "./types";

/**
 * Prompt de seleção de candidatos a clip a partir de uma janela de transcrição.
 *
 * Versionado: qualquer alteração ao texto exige bump de `version` (o teste de snapshot
 * em tests/unit/clips/prompts.test.ts falha caso contrário). Cada `clip_candidates`
 * guarda `prompt_id` + `prompt_version` que o gerou.
 */

export interface CandidateSelectionInput {
  windowText: string;
  windowStartSec: number;
  windowEndSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  maxCandidates: number;
  language: string;
  programContext?: string;
}

function tc(sec: number): string {
  return sec.toFixed(1);
}

export const candidateSelectionPrompt: ClipPrompt<CandidateSelectionInput> = {
  id: "clips.candidate-selection",
  version: 1,
  build(input) {
    const system = [
      "És um editor de vídeo sénior de um grupo de media português (Grupo Media Capital).",
      "Recebes um excerto de transcrição de um programa de arquivo, com timestamps em segundos e orador.",
      "A tua tarefa é propor os segmentos com mais potencial para clips curtos para redes sociais e site:",
      "momentos autocontidos, com gancho claro nos primeiros segundos, tensão, humor, revelação, frase forte,",
      "ou explicação memorável. Evita segmentos que dependem de contexto exterior ao excerto.",
      "",
      "Regras absolutas:",
      "- Usa APENAS timestamps que existam no excerto; a transcrição é a fonte de verdade. Nunca inventes tempos.",
      "- start_sec e end_sec devem coincidir com o início e o fim de frases do excerto.",
      `- Cada clip dura entre ${input.minDurationSec} e ${input.maxDurationSec} segundos.`,
      `- Propõe no máximo ${input.maxCandidates} candidatos; menos se não houver material de qualidade. Zero é aceitável.`,
      "- Não sobreponhas candidatos entre si.",
      "- Títulos em português de Portugal, curtos (máx. 80 caracteres), sem clickbait enganador.",
      "- score é um inteiro 0–100: probabilidade de o editor humano aprovar o clip sem alterações.",
      "- rationale: 1–2 frases objetivas, em português de Portugal, sobre porque funciona como clip.",
      "",
      "Responde APENAS com JSON válido, sem markdown nem texto adicional, com esta forma exata:",
      '{"candidates":[{"title":"...","start_sec":123.4,"end_sec":167.9,"score":78,"rationale":"...","speakers":["SPEAKER_00"]}]}',
    ].join("\n");

    const context = input.programContext
      ? `Contexto do programa: ${input.programContext}\n\n`
      : "";

    const user = [
      `${context}Língua da transcrição: ${input.language}.`,
      `Excerto: ${tc(input.windowStartSec)}s → ${tc(input.windowEndSec)}s.`,
      "",
      "Transcrição (formato: [início → fim] ORADOR: texto):",
      input.windowText,
      "",
      "Devolve o JSON com os candidatos.",
    ].join("\n");

    return { system, user };
  },
};
