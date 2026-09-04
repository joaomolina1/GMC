import type { ClipJobRow, ClipJobStep, ClipRenderRow } from "@lib/clips/types";
import type { QueueClient } from "../../src/queue";
import type { FakeDb } from "./fake-supabase";

/**
 * Fila em memória com a mesma semântica das RPCs SQL (claim/heartbeat/complete/fail/release),
 * a operar sobre as tabelas do FakeDb para os passos verem o estado atualizado.
 */
export function createFakeQueue(
  db: FakeDb,
  opts: { workerId: string; leaseSeconds?: number }
): QueueClient & { calls: string[]; heartbeatOk: boolean } {
  const calls: string[] = [];
  const jobs = () => (db.tables.clip_jobs ??= []) as unknown as ClipJobRow[];
  const renders = () => (db.tables.clip_renders ??= []) as unknown as ClipRenderRow[];
  const leaseMs = (opts.leaseSeconds ?? 900) * 1000;
  const lease = () => new Date(Date.now() + leaseMs).toISOString();

  const q = {
    calls,
    heartbeatOk: true,
    async claimJob() {
      calls.push("claimJob");
      const now = Date.now();
      const job = jobs()
        .filter(
          (j) =>
            j.attempts < j.max_attempts &&
            (j.status === "queued" || (j.status === "running" && (!j.lease_until || Date.parse(j.lease_until) < now)))
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (!job) return null;
      Object.assign(job, {
        status: "running",
        attempts: job.attempts + 1,
        lease_until: lease(),
        worker_id: opts.workerId,
        started_at: job.started_at ?? new Date().toISOString(),
        error: null,
        error_step: null,
      });
      return { ...job };
    },
    async heartbeatJob(jobId: string, progress?: number) {
      calls.push("heartbeatJob");
      const job = jobs().find((j) => j.id === jobId && j.worker_id === opts.workerId && j.status === "running");
      if (!job || !q.heartbeatOk) return false;
      job.lease_until = lease();
      if (progress !== undefined) job.progress = progress;
      return true;
    },
    async completeStep(jobId: string, nextStep: ClipJobStep, progress: number) {
      calls.push(`completeStep:${nextStep}`);
      const job = jobs().find((j) => j.id === jobId && j.worker_id === opts.workerId && j.status === "running");
      if (!job) return null;
      const done = nextStep === "ready";
      Object.assign(job, {
        step: nextStep,
        progress: done ? 100 : progress,
        status: done ? "done" : "running",
        lease_until: done ? null : lease(),
        completed_at: done ? new Date().toISOString() : null,
        worker_id: done ? null : job.worker_id,
        error: null,
        error_step: null,
      });
      return { ...job };
    },
    async failJob(jobId: string, error: string, retryable: boolean) {
      calls.push(`failJob:${retryable ? "retry" : "final"}`);
      const job = jobs().find((j) => j.id === jobId && j.worker_id === opts.workerId && j.status === "running");
      if (!job) return null;
      const requeue = retryable && job.attempts < job.max_attempts;
      Object.assign(job, {
        status: requeue ? "queued" : "failed",
        error,
        error_step: job.step,
        lease_until: null,
        worker_id: null,
        completed_at: requeue ? null : new Date().toISOString(),
      });
      return { ...job };
    },
    async releaseJob(jobId: string) {
      calls.push("releaseJob");
      const job = jobs().find((j) => j.id === jobId && j.worker_id === opts.workerId && j.status === "running");
      if (!job) return false;
      Object.assign(job, { status: "queued", attempts: Math.max(0, job.attempts - 1), lease_until: null, worker_id: null });
      return true;
    },
    async claimRender() {
      calls.push("claimRender");
      const r = renders().find((x) => x.status === "queued" && x.attempts < x.max_attempts);
      if (!r) return null;
      Object.assign(r, { status: "running", attempts: r.attempts + 1, lease_until: lease(), worker_id: opts.workerId, error: null });
      return { ...r };
    },
    async heartbeatRender(renderId: string) {
      calls.push("heartbeatRender");
      const r = renders().find((x) => x.id === renderId && x.worker_id === opts.workerId && x.status === "running");
      if (!r || !q.heartbeatOk) return false;
      r.lease_until = lease();
      return true;
    },
    async completeRender(renderId: string, storagePath: string, durationSec: number, sizeBytes: number) {
      calls.push("completeRender");
      const r = renders().find((x) => x.id === renderId && x.worker_id === opts.workerId && x.status === "running");
      if (!r) return null;
      Object.assign(r, {
        status: "done",
        storage_path: storagePath,
        duration_sec: durationSec,
        size_bytes: sizeBytes,
        lease_until: null,
        worker_id: null,
        completed_at: new Date().toISOString(),
      });
      return { ...r };
    },
    async failRender(renderId: string, error: string, retryable: boolean) {
      calls.push(`failRender:${retryable ? "retry" : "final"}`);
      const r = renders().find((x) => x.id === renderId && x.worker_id === opts.workerId && x.status === "running");
      if (!r) return null;
      const requeue = retryable && r.attempts < r.max_attempts;
      Object.assign(r, { status: requeue ? "queued" : "failed", error, lease_until: null, worker_id: null });
      return { ...r };
    },
    async releaseRender(renderId: string) {
      calls.push("releaseRender");
      const r = renders().find((x) => x.id === renderId && x.worker_id === opts.workerId && x.status === "running");
      if (!r) return false;
      Object.assign(r, { status: "queued", attempts: Math.max(0, r.attempts - 1), lease_until: null, worker_id: null });
      return true;
    },
  };
  return q;
}
