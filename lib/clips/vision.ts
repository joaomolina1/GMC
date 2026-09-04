import { z } from "zod";
import { computeModelCost, getProvider } from "@lib/ai/registry";
import type { MessageContent, TokenUsage } from "@lib/ai/types";
import { visualValidationPrompt } from "./prompts/visual-validation";

/**
 * Validação visual de um candidato: 2–3 frames JPEG (base64) pelo caminho multimodal
 * já existente. Devolve coerência, notas e qual o frame a usar como thumbnail.
 * Nunca envia vídeo — só imagens já extraídas pelo worker.
 */

export interface VisionFrame {
  data: string;
  mediaType: string;
  /** Offset (segundos) relativo ao início do clip. */
  offsetSec: number;
}

export interface VisionGenerateFn {
  (opts: { system: string; content: MessageContent[]; maxTokens: number }): Promise<{
    content: string;
    usage: TokenUsage;
  }>;
}

export function createClaudeVisionGenerate(model: string): VisionGenerateFn {
  return async ({ system, content, maxTokens }) => {
    const provider = getProvider(model);
    const result = await provider.generate({
      model,
      system,
      messages: [{ role: "user", content }],
      maxTokens,
    });
    return { content: result.content, usage: result.usage };
  };
}

export const visionResponseSchema = z.object({
  coherent: z.boolean(),
  best_frame_index: z.number().int().min(0),
  notes: z.string().default(""),
});

export type VisionVerdict = z.infer<typeof visionResponseSchema>;

export function parseVisionResponse(text: string, frameCount: number): VisionVerdict {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("Resposta de visão sem JSON");
  const parsed = visionResponseSchema.parse(JSON.parse(body.slice(first, last + 1)));
  return {
    ...parsed,
    best_frame_index: Math.min(parsed.best_frame_index, Math.max(0, frameCount - 1)),
  };
}

export interface ValidateVisuallyInput {
  candidate: { title: string; rationale: string; transcriptExcerpt: string };
  frames: VisionFrame[];
  model: string;
  generate?: VisionGenerateFn;
}

export interface ValidateVisuallyResult extends VisionVerdict {
  usage: TokenUsage;
  costEur: number;
  promptId: string;
  promptVersion: number;
  model: string;
}

export async function validateCandidateVisually(input: ValidateVisuallyInput): Promise<ValidateVisuallyResult> {
  if (input.frames.length === 0) throw new Error("Sem frames para validar");
  const prompt = visualValidationPrompt;
  const built = prompt.build({
    title: input.candidate.title,
    rationale: input.candidate.rationale,
    transcriptExcerpt: input.candidate.transcriptExcerpt,
    frameCount: input.frames.length,
    frameOffsetsSec: input.frames.map((f) => f.offsetSec),
  });

  const content: MessageContent[] = [
    ...input.frames.map<MessageContent>((f) => ({
      type: "image",
      source: { type: "base64", media_type: f.mediaType, data: f.data },
    })),
    { type: "text", text: built.user },
  ];

  const generate = input.generate ?? createClaudeVisionGenerate(input.model);
  const result = await generate({ system: built.system, content, maxTokens: 512 });
  const verdict = parseVisionResponse(result.content, input.frames.length);

  return {
    ...verdict,
    usage: result.usage,
    costEur: computeModelCost(input.model, result.usage),
    promptId: prompt.id,
    promptVersion: prompt.version,
    model: input.model,
  };
}

/** Offsets dos frames dentro do clip: 10 %, 50 % e 90 % da duração. */
export function frameOffsets(durationSec: number, count = 3): number[] {
  const n = Math.max(1, Math.min(count, 5));
  if (n === 1) return [durationSec / 2];
  const fractions = n === 2 ? [0.25, 0.75] : Array.from({ length: n }, (_, i) => 0.1 + (0.8 * i) / (n - 1));
  return fractions.map((f) => Math.round(durationSec * f * 100) / 100);
}
