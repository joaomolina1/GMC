import { rm } from "node:fs/promises";
import path from "node:path";
import type { StepContext } from "./context";

/**
 * Não é um passo da BD (o `complete_clip_job_step('ready')` fecha o job): limpa os artefactos
 * locais que não voltam a ser precisos. O source fica em cache para renders subsequentes e é
 * varrido pelo `sweepCache` do loop quando envelhece.
 */
export async function finalizeJob(ctx: Pick<StepContext, "workDir" | "log" | "job">): Promise<void> {
  await Promise.all([
    rm(path.join(ctx.workDir, "frames"), { recursive: true, force: true }),
    rm(path.join(ctx.workDir, "audio.wav"), { force: true }),
  ]);
  ctx.log("info", "job concluído", { jobId: ctx.job.id });
}
