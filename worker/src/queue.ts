import type { ClipJobRow, ClipJobStep, ClipRenderRow } from "@lib/clips/types";
import type { ServiceClient } from "./supabase";

/**
 * Chamadas às RPCs da fila (SECURITY DEFINER, service_role). Todas devolvem a linha atualizada
 * ou null quando o worker já não detém o lease — o chamador deve parar sem tocar mais no job.
 */

function first<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

export interface QueueClient {
  claimJob(): Promise<ClipJobRow | null>;
  heartbeatJob(jobId: string, progress?: number): Promise<boolean>;
  completeStep(jobId: string, nextStep: ClipJobStep, progress: number): Promise<ClipJobRow | null>;
  failJob(jobId: string, error: string, retryable: boolean): Promise<ClipJobRow | null>;
  releaseJob(jobId: string): Promise<boolean>;
  claimRender(): Promise<ClipRenderRow | null>;
  heartbeatRender(renderId: string): Promise<boolean>;
  completeRender(renderId: string, storagePath: string, durationSec: number, sizeBytes: number): Promise<ClipRenderRow | null>;
  failRender(renderId: string, error: string, retryable: boolean): Promise<ClipRenderRow | null>;
  releaseRender(renderId: string): Promise<boolean>;
}

export function createQueueClient(
  supabase: ServiceClient,
  opts: { workerId: string; leaseSeconds: number }
): QueueClient {
  const rpc = async <T>(name: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw new Error(`RPC ${name}: ${error.message}`);
    return data as T;
  };
  return {
    async claimJob() {
      return first<ClipJobRow>(await rpc("claim_next_clip_job", { p_worker_id: opts.workerId, p_lease_seconds: opts.leaseSeconds }));
    },
    async heartbeatJob(jobId, progress) {
      return Boolean(
        await rpc<boolean>("heartbeat_clip_job", {
          p_job_id: jobId,
          p_worker_id: opts.workerId,
          p_lease_seconds: opts.leaseSeconds,
          p_progress: progress ?? null,
        })
      );
    },
    async completeStep(jobId, nextStep, progress) {
      return first<ClipJobRow>(
        await rpc("complete_clip_job_step", {
          p_job_id: jobId,
          p_worker_id: opts.workerId,
          p_next_step: nextStep,
          p_progress: progress,
          p_lease_seconds: opts.leaseSeconds,
        })
      );
    },
    async failJob(jobId, error, retryable) {
      return first<ClipJobRow>(
        await rpc("fail_clip_job", { p_job_id: jobId, p_worker_id: opts.workerId, p_error: error, p_retryable: retryable })
      );
    },
    async releaseJob(jobId) {
      return Boolean(await rpc<boolean>("release_clip_job", { p_job_id: jobId, p_worker_id: opts.workerId }));
    },
    async claimRender() {
      return first<ClipRenderRow>(
        await rpc("claim_next_clip_render", { p_worker_id: opts.workerId, p_lease_seconds: opts.leaseSeconds })
      );
    },
    async heartbeatRender(renderId) {
      return Boolean(
        await rpc<boolean>("heartbeat_clip_render", {
          p_render_id: renderId,
          p_worker_id: opts.workerId,
          p_lease_seconds: opts.leaseSeconds,
        })
      );
    },
    async completeRender(renderId, storagePath, durationSec, sizeBytes) {
      return first<ClipRenderRow>(
        await rpc("complete_clip_render", {
          p_render_id: renderId,
          p_worker_id: opts.workerId,
          p_storage_path: storagePath,
          p_duration_sec: durationSec,
          p_size_bytes: sizeBytes,
        })
      );
    },
    async failRender(renderId, error, retryable) {
      return first<ClipRenderRow>(
        await rpc("fail_clip_render", { p_render_id: renderId, p_worker_id: opts.workerId, p_error: error, p_retryable: retryable })
      );
    },
    async releaseRender(renderId) {
      return Boolean(await rpc<boolean>("release_clip_render", { p_render_id: renderId, p_worker_id: opts.workerId }));
    },
  };
}
