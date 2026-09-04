import type { Beat, CastMember, Screenplay } from "./types";

/**
 * Constrói prompts para o Veo 3.1 (Gemini API) a partir de um argumento.
 *
 * Modo "extend": o 1.º beat gera 8 s; cada beat seguinte estende o vídeo em 7 s,
 * herdando atores, guarda-roupa e luz (continuidade real).
 * Modo "shots": cada beat é um clip independente de 8 s; a consistência vem das
 * descrições fixas do elenco e de imagens de referência.
 */

export const VEO_MODELS = {
  quality: "veo-3.1-generate-preview",
  fast: "veo-3.1-fast-generate-preview",
  lite: "veo-3.1-lite-generate-preview",
} as const;

export type VeoModel = (typeof VEO_MODELS)[keyof typeof VEO_MODELS];

export const NEGATIVE_PROMPT =
  "subtitles, captions, on-screen text, watermark, logo, background music, cartoon, anime, illustration, blurry, distorted faces, extra fingers, Brazilian Portuguese accent, English speech";

const LANGUAGE_RULE =
  "All dialogue is spoken in European Portuguese with a natural Portugal (Lisbon) accent — never Brazilian Portuguese. Lip movements must match the Portuguese words exactly; deliver lines at a natural, unhurried pace.";

/** Personagens que aparecem no beat (pelas falas ou por menção no plano). */
export function detectCharacters(beat: Beat, cast: CastMember[]): CastMember[] {
  const hay = `${beat.shot} ${beat.lines.map((l) => l.who).join(" ")}`.toLowerCase();
  return cast.filter((c) => {
    const first = c.name.split(" ")[0].toLowerCase();
    return hay.includes(first) || hay.includes(c.name.toLowerCase());
  });
}

function castBlock(members: CastMember[]): string {
  if (!members.length) return "";
  return `Characters: ${members.map((c) => `${c.name} (${c.look})`).join("; ")}.`;
}

function dialogueBlock(beat: Beat): string {
  if (!beat.lines.length) return "No dialogue in this segment — performance is silent and physical.";
  const lines = beat.lines
    .map((l) => `${l.who}${l.tone ? ` (${l.tone})` : ""} says in Portuguese: "${l.text}"`)
    .join(" ");
  return `Dialogue: ${lines}`;
}

function soundBlock(beat: Beat): string {
  return `Sound: ${beat.sfx ?? "quiet naturalistic room tone"}. No music.`;
}

export function buildOpeningPrompt(sp: Screenplay): string {
  const beat = sp.beats[0];
  const chars = detectCharacters(beat, sp.cast);
  return [
    sp.visualBible,
    "Vertical 9:16 portrait composition.",
    `Setting: ${sp.setting}`,
    castBlock(chars.length ? chars : sp.cast.slice(0, 2)),
    `Action: ${beat.shot}`,
    dialogueBlock(beat),
    LANGUAGE_RULE,
    soundBlock(beat),
    "No subtitles, no captions, no on-screen text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildExtensionPrompt(sp: Screenplay, index: number): string {
  const beat = sp.beats[index];
  if (!beat) throw new Error(`Beat ${index} não existe`);
  const chars = detectCharacters(beat, sp.cast);
  return [
    "Continue the same scene seamlessly: same actors, same faces, same wardrobe, same lighting and camera language. Vertical 9:16.",
    castBlock(chars),
    `Action: ${beat.shot}`,
    dialogueBlock(beat),
    LANGUAGE_RULE,
    soundBlock(beat),
    "No subtitles, no captions, no on-screen text.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Prompt autónomo para um beat (modo "shots"). */
export function buildShotPrompt(sp: Screenplay, index: number): string {
  const beat = sp.beats[index];
  if (!beat) throw new Error(`Beat ${index} não existe`);
  const chars = detectCharacters(beat, sp.cast);
  return [
    sp.visualBible,
    "Vertical 9:16 portrait composition.",
    `Setting: ${sp.setting}`,
    castBlock(chars.length ? chars : sp.cast.slice(0, 2)),
    `Action: ${beat.shot}`,
    dialogueBlock(beat),
    LANGUAGE_RULE,
    soundBlock(beat),
    "No subtitles, no captions, no on-screen text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface PlannedStep {
  index: number;
  kind: "open" | "extend" | "shot";
  durationSeconds: 8 | 7;
  prompt: string;
  approxTokens: number;
}

/** Estimativa grosseira (~4 caracteres por token) — o Veo aceita até 1 024 tokens. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const VEO_PROMPT_TOKEN_LIMIT = 1024;

export function planEpisode(sp: Screenplay, mode: "extend" | "shots" = "extend"): PlannedStep[] {
  return sp.beats.map((beat, i) => {
    const prompt =
      mode === "shots"
        ? buildShotPrompt(sp, i)
        : i === 0
          ? buildOpeningPrompt(sp)
          : buildExtensionPrompt(sp, i);
    const kind: PlannedStep["kind"] = mode === "shots" ? "shot" : i === 0 ? "open" : "extend";
    return {
      index: i,
      kind,
      durationSeconds: mode === "shots" ? 8 : beat.dur,
      prompt,
      approxTokens: approxTokens(prompt),
    };
  });
}

/** Prompt de imagem para a ficha de personagem (referência de consistência). */
export function buildCharacterSheetPrompt(sp: Screenplay, member: CastMember): string {
  return `Photorealistic cinematic portrait, vertical 9:16, of ${member.name}: ${member.look}. ${sp.visualBible} Neutral expression, three-quarter view, eye-level, soft key light, shallow depth of field, no text, no watermark. AI-generated actor, not a real person.`;
}
