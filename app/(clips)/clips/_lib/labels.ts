import type { ClipJobStatus, ClipJobStep, ClipRenderStatus } from "@lib/clips/types";

export const JOB_STATUS_LABEL: Record<ClipJobStatus, string> = {
  queued: "Em fila",
  running: "A processar",
  failed: "Falhou",
  done: "Concluído",
};

export const JOB_STATUS_TONE: Record<ClipJobStatus, "neutral" | "brand" | "danger" | "success"> = {
  queued: "neutral",
  running: "brand",
  failed: "danger",
  done: "success",
};

export const STEP_LABEL: Record<ClipJobStep, string> = {
  probe: "A analisar o ficheiro",
  extract_audio: "A extrair áudio",
  detect_shots: "A detetar cortes de plano",
  transcribe: "A transcrever (WhisperX)",
  suggest: "A sugerir candidatos (Claude)",
  vision_check: "A validar visualmente",
  ready: "Pronto",
};

export const RENDER_STATUS_LABEL: Record<ClipRenderStatus, string> = {
  queued: "Render em fila",
  running: "A renderizar",
  failed: "Render falhou",
  done: "Render pronto",
};

export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s - h * 3600 - m * 60;
  const rr = r.toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rr}` : `${String(m).padStart(2, "0")}:${rr}`;
}

export function formatDelta(deltaSec: number): string {
  const sign = deltaSec > 0 ? "+" : deltaSec < 0 ? "−" : "";
  return `${sign}${Math.abs(deltaSec).toFixed(2).replace(".", ",")} s`;
}

export const SNAP_KIND_LABEL: Record<string, string> = {
  sentence: "fronteira de frase",
  word: "fronteira de palavra",
  shot: "corte de plano",
  clamp: "limite de duração",
  none: "sem ajuste",
};
