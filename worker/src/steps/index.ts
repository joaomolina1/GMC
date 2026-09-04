import type { ClipJobStep } from "@lib/clips/types";
import { NonRetryableError } from "../errors";
import { detectShotsStep } from "./detect-shots";
import { extractAudioStep } from "./extract-audio";
import { probeStep } from "./probe";
import { suggestStep } from "./suggest";
import { transcribeStep } from "./transcribe";
import { visionCheckStep } from "./vision-check";
import type { StepContext, StepFn, StepOutcome } from "./context";

export type { StepContext, StepFn, StepOutcome, StepModels } from "./context";
export { localPaths, objectPaths } from "./context";
export { finalizeJob } from "./finalize";

export const STEPS: Record<Exclude<ClipJobStep, "ready">, StepFn> = {
  probe: probeStep,
  extract_audio: extractAudioStep,
  detect_shots: detectShotsStep,
  transcribe: transcribeStep,
  suggest: suggestStep,
  vision_check: visionCheckStep,
};

/** Executa exatamente um passo (idempotente, retomável) e devolve o cursor seguinte. */
export async function runStep(step: ClipJobStep, ctx: StepContext): Promise<StepOutcome> {
  if (step === "ready") return { nextStep: "ready", progress: 100 };
  const fn = STEPS[step];
  if (!fn) throw new NonRetryableError(`Passo desconhecido: ${step}`);
  return fn(ctx);
}
