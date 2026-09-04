import type { ClipPrompt } from "./types";

/**
 * Validação visual de um candidato: 2–3 frames JPEG já extraídos (nunca o vídeo)
 * + título/justificação. O modelo confirma se a imagem é coerente com o momento e
 * escolhe o melhor frame para thumbnail.
 */

export interface VisualValidationInput {
  title: string;
  rationale: string;
  transcriptExcerpt: string;
  frameCount: number;
  /** Timestamps (segundos, relativos ao clip) de cada frame, pela ordem enviada. */
  frameOffsetsSec: number[];
}

export const visualValidationPrompt: ClipPrompt<VisualValidationInput> = {
  id: "clips.visual-validation",
  version: 1,
  build(input) {
    const system = [
      "És um editor de vídeo a validar um clip candidato para redes sociais.",
      "Recebes frames extraídos do intervalo proposto e o contexto textual do momento.",
      "Avalia se as imagens são coerentes com o que a transcrição descreve (mesmos intervenientes em plano,",
      "sem separadores, cartões, publicidade ou ecrãs negros) e escolhe o melhor frame para thumbnail",
      "(rosto visível, expressão forte, enquadramento limpo, sem texto sobreposto).",
      "",
      "Responde APENAS com JSON válido, sem markdown, com esta forma exata:",
      '{"coherent":true,"best_frame_index":0,"notes":"..."}',
      "best_frame_index é o índice (a começar em 0) do frame pela ordem em que foi enviado.",
      "notes: 1 frase em português de Portugal (problemas visuais, se existirem).",
    ].join("\n");

    const offsets = input.frameOffsetsSec.map((t, i) => `frame ${i}: +${t.toFixed(1)}s`).join(", ");

    const user = [
      `Título proposto: ${input.title}`,
      `Justificação: ${input.rationale}`,
      "",
      "Excerto da transcrição:",
      input.transcriptExcerpt,
      "",
      `Frames enviados (${input.frameCount}): ${offsets}.`,
      "Devolve o JSON.",
    ].join("\n");

    return { system, user };
  },
};
