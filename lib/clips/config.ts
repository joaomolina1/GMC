import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";

/** Modelos usados pelo módulo de clips (override por env). */
export function getClipsSuggestModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLIPS_SUGGEST_MODEL?.trim() || "claude-sonnet-4-5";
}

export function getClipsVisionModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLIPS_VISION_MODEL?.trim() || DEFAULT_AGENT_MODEL;
}

/** Validade das signed URLs (segundos). Preview do source precisa de mais tempo que um download. */
export const CLIPS_PREVIEW_URL_TTL_SEC = 60 * 60;
export const CLIPS_DOWNLOAD_URL_TTL_SEC = 5 * 60;
export const CLIPS_THUMBNAIL_URL_TTL_SEC = 60 * 60;

/** Extensões aceites no upload. */
export const CLIPS_ACCEPTED_EXTENSIONS = ["mp4", "mov", "mkv", "mxf", "webm", "m4v", "mpg", "mpeg", "ts", "avi"] as const;

export function isAcceptedClipExtension(ext: string): boolean {
  return (CLIPS_ACCEPTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}
