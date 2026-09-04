import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipJobRow, ClipRenderRow, VideoAssetRow } from "@lib/clips/types";
import { DEFAULT_CLIP_JOB_PARAMS } from "@lib/clips/types";
import { syntheticTranscript, FixtureTranscriptionProvider } from "@lib/clips/transcription/fixture";
import { createFakeDb, fakeId, type FakeDb } from "./helpers/fake-supabase";
import { createFakeFfmpeg, createFakeStorageIO } from "./helpers/fakes";
import { createFakeQueue } from "./helpers/fake-queue";

/**
 * Claude mockado: nunca chama a API. Para a seleção devolve um candidato a meio da janela;
 * para a visão devolve coerente + frame 1.
 */
vi.mock("@lib/ai/registry", () => ({
  getProvider: () => ({
    name: "anthropic",
    async generate(opts: { messages: Array<{ content: unknown }>; system?: string }) {
      const content = opts.messages[0]?.content;
      const usage = { promptTokens: 500, completionTokens: 60 };
      if (Array.isArray(content)) {
        return { content: '{"coherent":true,"best_frame_index":1,"notes":"Plano limpo."}', usage, model: "vision" };
      }
      const user = String(content);
      const m = user.match(/Excerto: ([\d.]+)s → ([\d.]+)s/);
      const start = m ? Number(m[1]) : 0;
      const end = m ? Number(m[2]) : 60;
      const a = start + 10;
      const b = Math.min(end - 2, a + 30);
      return {
        content: JSON.stringify({
          candidates: [{ title: `Momento ${Math.round(a)}`, start_sec: a, end_sec: b, score: 70 + (Math.round(a) % 20), rationale: "Gancho claro." }],
        }),
        usage,
        model: "suggest",
      };
    },
  }),
  computeModelCost: (_m: string, u: { promptTokens: number; completionTokens: number }) => (u.promptTokens * 3 + u.completionTokens * 15) / 1e6,
}));

import { processJob, processRenderJob, type WorkerDeps } from "../src/worker";
import { runStep } from "../src/steps";
import { NonRetryableError } from "../src/errors";

const USER = "user-0001";
const WORKER = "worker-test";

function seedAsset(db: FakeDb, overrides: Partial<VideoAssetRow> = {}): VideoAssetRow {
  const id = fakeId("asset");
  const asset: VideoAssetRow = {
    id,
    owner_id: USER,
    filename: "programa.mp4",
    storage_path: `${USER}/${id}/source.mp4`,
    mime: "video/mp4",
    size_bytes: 1000,
    duration_sec: null,
    fps: null,
    width: null,
    height: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  (db.tables.video_assets ??= []).push(asset as unknown as Record<string, unknown>);
  db.storage.objects.set(asset.storage_path, { data: Buffer.from("fake-video"), contentType: "video/mp4" });
  return asset;
}

function seedJob(db: FakeDb, asset: VideoAssetRow, params: Record<string, unknown> = {}): ClipJobRow {
  const job: ClipJobRow = {
    id: fakeId("job"),
    video_asset_id: asset.id,
    user_id: USER,
    status: "queued",
    step: "probe",
    progress: 0,
    attempts: 0,
    max_attempts: 3,
    lease_until: null,
    worker_id: null,
    error: null,
    error_step: null,
    params: { ...DEFAULT_CLIP_JOB_PARAMS, minDurationSec: 10, maxDurationSec: 60, windowSec: 120, overlapSec: 10, ...params },
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  (db.tables.clip_jobs ??= []).push(job as unknown as Record<string, unknown>);
  return job;
}

describe("worker — pipeline de passos com ffmpeg mockado", () => {
  let db: FakeDb;
  let workRoot: string;

  beforeEach(async () => {
    db = createFakeDb();
    workRoot = await mkdtemp(path.join(os.tmpdir(), "gmc-clips-worker-"));
  });
  afterEach(async () => {
    await rm(workRoot, { recursive: true, force: true });
  });

  function deps(overrides: Partial<WorkerDeps> = {}): WorkerDeps & { ffmpegCalls: { bin: string; args: string[] }[] } {
    const ffmpeg = createFakeFfmpeg({
      probe: { duration: 300 },
      sceneChanges: [
        { t: 12.9, score: 0.8 },
        { t: 61.5, score: 0.6 },
        { t: 140.2, score: 0.9 },
      ],
    });
    const transcript = syntheticTranscript({ sentenceCount: 60, sentenceSec: 4, gapSec: 0.4 }); // ≈ 264 s
    return {
      supabase: db.client,
      queue: createFakeQueue(db, { workerId: WORKER }),
      io: createFakeStorageIO(db.storage),
      ffmpeg,
      transcriber: new FixtureTranscriptionProvider({ provider: "fixture", model: "synthetic", language: "pt", segments: transcript }),
      models: { suggest: "claude-sonnet-4-5", vision: "claude-haiku-4-5" },
      workerId: WORKER,
      workRoot,
      heartbeatMs: 50,
      renderPreset: "ultrafast",
      renderCrf: 30,
      ffmpegCalls: ffmpeg.calls,
      ...overrides,
    };
  }

  it("corre todos os passos até 'done' e deixa a BD/Storage consistentes", async () => {
    const asset = seedAsset(db);
    const job = seedJob(db, asset);
    const d = deps();
    const claimed = (await d.queue.claimJob())!;
    expect(claimed.status).toBe("running");

    const result = await processJob(d, claimed, new AbortController().signal);
    expect(result.outcome).toBe("done");
    expect(result.stepsRun).toBe(6);

    const finalJob = db.tables.clip_jobs[0];
    expect(finalJob).toMatchObject({ status: "done", step: "ready", progress: 100, worker_id: null, lease_until: null });
    expect(finalJob.completed_at).toBeTruthy();

    const probed = db.tables.video_assets[0];
    expect(probed).toMatchObject({ duration_sec: 300, fps: 25, width: 1920, height: 1080 });

    expect(db.tables.shot_changes).toHaveLength(3);
    expect(db.tables.transcripts).toHaveLength(1);
    expect(db.tables.transcripts[0]).toMatchObject({ provider: "fixture", video_asset_id: asset.id });
    expect(db.tables.transcript_segments).toHaveLength(60);

    const candidates = db.tables.clip_candidates;
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c).toMatchObject({ job_id: job.id, status: "pending", prompt_id: "clips.candidate-selection", prompt_version: 1, model: "claude-sonnet-4-5" });
      expect(Number(c.out_sec) - Number(c.in_sec)).toBeGreaterThanOrEqual(10);
      expect(Number(c.out_sec) - Number(c.in_sec)).toBeLessThanOrEqual(60);
      expect((c.snap_debug as { source: string }).source).toBe("worker");
    }
    // Vision: os top-K (≤ 5) ficaram verificados com thumbnail no frame 1.
    const checked = candidates.filter((c) => c.vision_checked);
    expect(checked.length).toBe(Math.min(5, candidates.length));
    for (const c of checked) {
      expect(String(c.thumbnail_storage_path)).toMatch(new RegExp(`${USER}/${asset.id}/frames/${c.id}-1\\.jpg$`));
      expect(db.storage.objects.has(String(c.thumbnail_storage_path))).toBe(true);
    }

    // Custo atribuído ao dono do job.
    const usage = db.tables.usage_logs;
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((u) => u.user_id === USER && u.provider === "anthropic")).toBe(true);
    expect(usage.some((u) => (u.metadata as { source: string }).source === "clips.suggest")).toBe(true);
    expect(usage.some((u) => (u.metadata as { source: string }).source === "clips.vision")).toBe(true);

    // Storage: áudio e transcript bruto arquivados na pasta do asset.
    expect(db.storage.objects.has(`${USER}/${asset.id}/audio.wav`)).toBe(true);
    expect(db.storage.objects.has(`${USER}/${asset.id}/transcript.json`)).toBe(true);

    // O vídeo nunca foi enviado ao modelo: o ffmpeg só foi chamado com ficheiros locais.
    expect(d.ffmpegCalls.some((c) => c.args.some((a) => a.includes("gt(scene")))).toBe(true);
    expect(d.ffmpegCalls.some((c) => c.args.includes("-ar") && c.args.includes("16000"))).toBe(true);
  });

  it("transcribe é idempotente: segunda execução salta sem duplicar", async () => {
    const asset = seedAsset(db);
    const job = seedJob(db, asset);
    const d = deps();
    const claimed = (await d.queue.claimJob())!;
    const ctxBase = {
      supabase: d.supabase,
      io: d.io,
      ffmpeg: d.ffmpeg,
      transcriber: d.transcriber,
      models: d.models,
      job: { ...claimed, step: "transcribe" as const },
      asset,
      params: { ...DEFAULT_CLIP_JOB_PARAMS },
      workDir: path.join(workRoot, "assets", asset.id),
      signal: new AbortController().signal,
      heartbeat: async () => undefined,
      log: () => undefined,
    };
    const first = await runStep("transcribe", ctxBase);
    expect(first.nextStep).toBe("suggest");
    const calls = (d.transcriber as FixtureTranscriptionProvider).calls.length;
    const second = await runStep("transcribe", ctxBase);
    expect(second.nextStep).toBe("suggest");
    expect((d.transcriber as FixtureTranscriptionProvider).calls.length).toBe(calls);
    expect(db.tables.transcripts).toHaveLength(1);
    expect(db.tables.transcript_segments).toHaveLength(60);
    void job;
  });

  it("erro não repetível (sem áudio) → failed sem repor na fila", async () => {
    const asset = seedAsset(db);
    seedJob(db, asset);
    const ffmpeg = createFakeFfmpeg({ probe: { audio: false } });
    const d = deps({ ffmpeg });
    const claimed = (await d.queue.claimJob())!;
    const result = await processJob(d, claimed, new AbortController().signal);
    expect(result.outcome).toBe("failed");
    expect(result.error).toMatch(/faixa de áudio/);
    expect(db.tables.clip_jobs[0]).toMatchObject({ status: "failed", step: "probe", error_step: "probe", attempts: 1 });
    expect((d.queue as unknown as { calls: string[] }).calls).toContain("failJob:final");
  });

  it("erro repetível (ffmpeg falha) → volta a 'queued' até esgotar tentativas", async () => {
    const asset = seedAsset(db);
    seedJob(db, asset);
    const ffmpeg = createFakeFfmpeg({
      failOn: (call) => (call.args.includes("-ar") ? "ffmpeg: disco cheio" : null),
    });
    const d = deps({ ffmpeg });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const claimed = (await d.queue.claimJob())!;
      expect(claimed.attempts).toBe(attempt);
      const result = await processJob(d, claimed, new AbortController().signal);
      if (attempt < 3) {
        expect(result.outcome).toBe("requeued");
        expect(db.tables.clip_jobs[0]).toMatchObject({ status: "queued", step: "extract_audio", error_step: "extract_audio" });
      } else {
        expect(result.outcome).toBe("failed");
        expect(db.tables.clip_jobs[0]).toMatchObject({ status: "failed", attempts: 3 });
      }
    }
    expect(await d.queue.claimJob()).toBeNull();
  });

  it("SIGTERM a meio de um passo liberta o job sem gastar tentativa e o cursor mantém-se", async () => {
    const asset = seedAsset(db);
    seedJob(db, asset);
    const stop = new AbortController();
    const slowTranscriber = {
      name: "slow",
      async transcribe() {
        // Simula o WhisperX a correr: o SIGTERM chega durante este passo.
        stop.abort();
        await new Promise((r) => setTimeout(r, 20));
        const { AbortedError } = await import("../src/errors");
        throw new AbortedError("python interrompido");
      },
    };
    const d = deps({ transcriber: slowTranscriber });
    const claimed = (await d.queue.claimJob())!;
    const result = await processJob(d, claimed, stop.signal);
    expect(result.outcome).toBe("released");
    expect(result.stepsRun).toBe(3); // probe, extract_audio, detect_shots concluídos
    expect(db.tables.clip_jobs[0]).toMatchObject({ status: "queued", step: "transcribe", attempts: 0, worker_id: null });
    // Passos já feitos não se repetem: o áudio ficou no Storage e os cortes na BD.
    expect(db.storage.objects.has(`${USER}/${asset.id}/audio.wav`)).toBe(true);
    expect(db.tables.shot_changes).toHaveLength(3);
  });

  it("perda de lease (heartbeat false) aborta sem marcar falha nem libertar", async () => {
    const asset = seedAsset(db);
    seedJob(db, asset);
    const d = deps({ heartbeatMs: 5 });
    const queue = d.queue as ReturnType<typeof createFakeQueue>;
    const slowTranscriber = {
      name: "slow",
      async transcribe() {
        queue.heartbeatOk = false;
        await new Promise((r) => setTimeout(r, 60));
        throw new Error("qualquer erro depois de perder o lease");
      },
    };
    d.transcriber = slowTranscriber;
    const claimed = (await d.queue.claimJob())!;
    const result = await processJob(d, claimed, new AbortController().signal);
    expect(result.outcome).toBe("lost");
    expect(queue.calls).not.toContain("failJob:retry");
    expect(queue.calls).not.toContain("failJob:final");
    expect(queue.calls).not.toContain("releaseJob");
  });

  it("vision_check pode ser desligado por parâmetros", async () => {
    const asset = seedAsset(db);
    seedJob(db, asset, { visionCheck: false });
    const d = deps();
    const claimed = (await d.queue.claimJob())!;
    const result = await processJob(d, claimed, new AbortController().signal);
    expect(result.outcome).toBe("done");
    expect(db.tables.clip_candidates.every((c) => !c.vision_checked)).toBe(true);
    expect(db.tables.usage_logs.every((u) => (u.metadata as { source: string }).source === "clips.suggest")).toBe(true);
  });
});

describe("worker — renders", () => {
  let db: FakeDb;
  let workRoot: string;

  beforeEach(async () => {
    db = createFakeDb();
    workRoot = await mkdtemp(path.join(os.tmpdir(), "gmc-clips-render-"));
  });
  afterEach(async () => {
    await rm(workRoot, { recursive: true, force: true });
  });

  function seedCandidate(asset: VideoAssetRow, status: "pending" | "approved" | "rejected") {
    const job = seedJob(db, asset);
    const cand = {
      id: fakeId("cand"),
      job_id: job.id,
      video_asset_id: asset.id,
      in_sec: 8.8,
      out_sec: 30.4,
      model_in_sec: 9,
      model_out_sec: 30,
      title: "Momento",
      score: 80,
      rationale: "",
      transcript_excerpt: "",
      speakers: [],
      prompt_id: "clips.candidate-selection",
      prompt_version: 1,
      model: "m",
      window_index: 0,
      snap_debug: null,
      thumbnail_storage_path: null,
      vision_checked: false,
      vision_notes: null,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (db.tables.clip_candidates ??= []).push(cand);
    const render: ClipRenderRow = {
      id: fakeId("render"),
      candidate_id: cand.id,
      requested_by: USER,
      status: "queued",
      in_sec: 8.8,
      out_sec: 30.4,
      burn_subtitles: true,
      storage_path: null,
      error: null,
      attempts: 0,
      max_attempts: 3,
      lease_until: null,
      worker_id: null,
      duration_sec: null,
      size_bytes: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    (db.tables.clip_renders ??= []).push(render as unknown as Record<string, unknown>);
    return { cand, render };
  }

  function seedTranscript(asset: VideoAssetRow) {
    const t = { id: fakeId("t"), video_asset_id: asset.id, provider: "fixture" };
    (db.tables.transcripts ??= []).push(t);
    const segs = syntheticTranscript({ sentenceCount: 10, sentenceSec: 4, gapSec: 0.4 });
    (db.tables.transcript_segments ??= []).push(
      ...segs.map((s) => ({
        transcript_id: t.id,
        idx: s.idx,
        start_sec: s.startSec,
        end_sec: s.endSec,
        speaker: s.speaker,
        text: s.text,
        words: s.words,
      }))
    );
  }

  function renderDeps(): WorkerDeps & { ffmpegCalls: { bin: string; args: string[] }[] } {
    const ffmpeg = createFakeFfmpeg({ probe: { duration: 21.6 } });
    return {
      supabase: db.client,
      queue: createFakeQueue(db, { workerId: WORKER }),
      io: createFakeStorageIO(db.storage),
      ffmpeg,
      transcriber: { name: "none", transcribe: async () => { throw new Error("não usado"); } },
      models: { suggest: "m", vision: "m" },
      workerId: WORKER,
      workRoot,
      heartbeatMs: 50,
      renderPreset: "ultrafast",
      renderCrf: 30,
      ffmpegCalls: ffmpeg.calls,
    };
  }

  it("recusa renderizar um candidato não aprovado (defesa além do trigger)", async () => {
    const asset = seedAsset(db, { duration_sec: 300 });
    seedCandidate(asset, "pending");
    const d = renderDeps();
    const render = (await d.queue.claimRender())!;
    const result = await processRenderJob(d, render, new AbortController().signal);
    expect(result.outcome).toBe("failed");
    expect(result.error).toMatch(/não está aprovado/);
    expect(db.tables.clip_renders[0]).toMatchObject({ status: "failed" });
    // Nunca chegou ao ffmpeg.
    expect(d.ffmpegCalls.filter((c) => c.bin === "ffmpeg")).toHaveLength(0);
  });

  it("renderiza um candidato aprovado com legendas e publica no Storage", async () => {
    const asset = seedAsset(db, { duration_sec: 300 });
    seedTranscript(asset);
    const { render } = seedCandidate(asset, "approved");
    const d = renderDeps();
    const claimed = (await d.queue.claimRender())!;
    const result = await processRenderJob(d, claimed, new AbortController().signal);
    expect(result.outcome).toBe("done");

    const done = db.tables.clip_renders[0];
    expect(done).toMatchObject({ status: "done", storage_path: `${USER}/${asset.id}/renders/${render.id}.mp4`, duration_sec: 21.6 });
    expect(db.storage.objects.has(`${USER}/${asset.id}/renders/${render.id}.mp4`)).toBe(true);

    const renderCall = d.ffmpegCalls.find((c) => c.args.includes("libx264"));
    expect(renderCall).toBeDefined();
    const vf = renderCall!.args[renderCall!.args.indexOf("-vf") + 1];
    expect(vf).toContain("subtitles=filename=");
    expect(renderCall!.args[renderCall!.args.indexOf("-ss") + 1]).toBe("8.800");
    expect(renderCall!.args[renderCall!.args.indexOf("-t") + 1]).toBe("21.600");
  });

  it("NonRetryableError não é repetível", () => {
    const err = new NonRetryableError("x");
    expect(err.retryable).toBe(false);
  });
});
