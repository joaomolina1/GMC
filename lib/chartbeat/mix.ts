import type { ChannelMix, ChartbeatPage, VideoPlayback } from "./types";

export function emptyMix(): ChannelMix {
  return {
    direct: 0,
    search: 0,
    social: 0,
    internal: 0,
    links: 0,
    new: 0,
    returning: 0,
    loyal: 0,
    mobile: 0,
    desktop: 0,
    tablet: 0,
    engagedSec: null,
    playing: null,
    paused: null,
    unplayed: null,
  };
}

export interface EngagedWeight {
  sum: number;
  people: number;
}

function roundCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Soma origem, dispositivo e fidelidade de uma página já associada ao canal. */
export function accumulatePage(mix: ChannelMix, page: ChartbeatPage, weight: EngagedWeight): void {
  mix.direct += roundCount(page.direct);
  mix.search += roundCount(page.search);
  mix.social += roundCount(page.social);
  mix.internal += roundCount(page.internal);
  mix.links += roundCount(page.links);
  mix.new += roundCount(page.loyalty?.new);
  mix.returning += roundCount(page.loyalty?.returning);
  mix.loyal += roundCount(page.loyalty?.loyal);
  mix.mobile += roundCount(page.platform?.m);
  mix.desktop += roundCount(page.platform?.d);
  mix.tablet += roundCount(page.platform?.t);

  const avg = page.engagedAvg;
  if (avg != null && Number.isFinite(avg) && page.people > 0) {
    weight.sum += avg * page.people;
    weight.people += page.people;
  }
}

export function finishEngaged(mix: ChannelMix, weight: EngagedWeight): void {
  mix.engagedSec = weight.people > 0 ? Math.round(weight.sum / weight.people) : null;
}

export function applyPlayback(mix: ChannelMix, playback: VideoPlayback): ChannelMix {
  return {
    ...mix,
    playing: playback.playing,
    paused: playback.paused,
    unplayed: playback.unplayed,
  };
}

/** Enum da Chartbeat: [unplayed, playing, paused, completed]. */
export function playbackFromEnum(value: unknown): VideoPlayback | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const nums = value.slice(0, 4).map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return {
    unplayed: Math.round(nums[0]),
    playing: Math.round(nums[1]),
    paused: Math.round(nums[2]),
    completed: Math.round(nums[3] ?? 0),
  };
}

export function mixToDb(mix: ChannelMix): Record<string, number> {
  const out: Record<string, number> = {
    direct: mix.direct,
    search: mix.search,
    social: mix.social,
    internal: mix.internal,
    links: mix.links,
    new: mix.new,
    returning: mix.returning,
    loyal: mix.loyal,
    mobile: mix.mobile,
    desktop: mix.desktop,
    tablet: mix.tablet,
  };
  if (mix.engagedSec != null) out.engaged_sec = mix.engagedSec;
  if (mix.playing != null) out.playing = mix.playing;
  if (mix.paused != null) out.paused = mix.paused;
  if (mix.unplayed != null) out.unplayed = mix.unplayed;
  return out;
}

function optCount(raw: Record<string, unknown>, key: string): number | null {
  if (!(key in raw) || raw[key] == null) return null;
  const n = Number(raw[key]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** `{}` (minutos antigos) devolve null. Um objecto com `search` é uma medição, mesmo a zero. */
export function mixFromDb(raw: unknown): ChannelMix | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!("search" in o) && !("playing" in o) && !("engaged_sec" in o)) return null;
  return {
    direct: roundCount(o.direct),
    search: roundCount(o.search),
    social: roundCount(o.social),
    internal: roundCount(o.internal),
    links: roundCount(o.links),
    new: roundCount(o.new),
    returning: roundCount(o.returning),
    loyal: roundCount(o.loyal),
    mobile: roundCount(o.mobile),
    desktop: roundCount(o.desktop),
    tablet: roundCount(o.tablet),
    engagedSec: optCount(o, "engaged_sec"),
    playing: optCount(o, "playing"),
    paused: optCount(o, "paused"),
    unplayed: optCount(o, "unplayed"),
  };
}

export function mixMapFromDb(raw: unknown): Record<string, ChannelMix> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, ChannelMix> = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const mix = mixFromDb(value);
    if (mix) out[slug] = mix;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
