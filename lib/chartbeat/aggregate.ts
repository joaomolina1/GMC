import { CHANNELS } from "./channels";
import { looksLikeLive, matchPage } from "./match";
import { accumulatePage, applyPlayback, emptyMix, finishEngaged, type EngagedWeight } from "./mix";
import type { ChannelMinute, ChartbeatPage, ChartbeatVideo, Snapshot, UnmatchedLive, VideoPlayback } from "./types";

export function truncateToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

export function isoMinute(date: Date): string {
  return truncateToMinute(date).toISOString();
}

function emptyMinute(slug: string): ChannelMinute {
  return {
    slug,
    people: 0,
    web: 0,
    app: 0,
    sources: [],
    programTitle: null,
    videoWatching: null,
    mix: emptyMix(),
  };
}

/** Soma concurrents Chartbeat das várias URLs/app do mesmo linear. */
export function aggregatePages(pages: ChartbeatPage[]): {
  channels: ChannelMinute[];
  unmatched: UnmatchedLive[];
  matchedCount: number;
} {
  const bySlug = new Map<string, ChannelMinute>(CHANNELS.map((c) => [c.slug, emptyMinute(c.slug)]));
  const engaged = new Map<string, EngagedWeight>(CHANNELS.map((c) => [c.slug, { sum: 0, people: 0 }]));
  const unmatched: UnmatchedLive[] = [];
  let matchedCount = 0;

  for (const page of pages) {
    const matched = matchPage(page);
    if (matched) {
      matchedCount += 1;
      const bucket = bySlug.get(matched.channelSlug);
      if (!bucket?.mix) continue;
      bucket.people += matched.people;
      if (matched.kind === "app") bucket.app += matched.people;
      else bucket.web += matched.people;
      bucket.sources.push(matched);
      accumulatePage(bucket.mix, page, engaged.get(matched.channelSlug)!);
      continue;
    }
    if (looksLikeLive(page) && page.people > 0) {
      unmatched.push({
        host: page.host,
        path: page.path,
        title: page.title || page.path,
        people: page.people,
      });
    }
  }

  for (const ch of bySlug.values()) {
    ch.sources.sort((a, b) => b.people - a.people);
    if (ch.mix) finishEngaged(ch.mix, engaged.get(ch.slug)!);
  }

  unmatched.sort((a, b) => b.people - a.people);

  return {
    channels: CHANNELS.map((c) => bySlug.get(c.slug)!),
    unmatched,
    matchedCount,
  };
}

/** Anexa o programa no ar (Chartbeat Video) sem misturar `watching` com concurrents de página. */
export function attachPrograms(channels: ChannelMinute[], videos: ChartbeatVideo[]): ChannelMinute[] {
  if (videos.length === 0) return channels;
  const byId = new Map<string, ChartbeatVideo>();
  for (const v of videos) {
    const prev = byId.get(v.path);
    if (!prev || v.watching > prev.watching) byId.set(v.path, v);
  }
  return channels.map((ch) => {
    const def = CHANNELS.find((c) => c.slug === ch.slug);
    if (!def?.videoIds.length) return ch;
    let best: ChartbeatVideo | null = null;
    for (const id of def.videoIds) {
      const v = byId.get(id);
      if (v && (!best || v.watching > best.watching)) best = v;
    }
    if (!best) return ch;
    return {
      ...ch,
      programTitle: best.title?.trim() || null,
      videoWatching: best.watching,
    };
  });
}

export function attachPlayback(
  channels: ChannelMinute[],
  playback: Record<string, VideoPlayback>
): ChannelMinute[] {
  return channels.map((ch) => {
    const state = playback[ch.slug];
    if (!state || !ch.mix) return ch;
    return { ...ch, mix: applyPlayback(ch.mix, state) };
  });
}

export function buildSnapshot(
  pages: ChartbeatPage[],
  videos: ChartbeatVideo[],
  capturedAt = new Date(),
  playback: Record<string, VideoPlayback> = {}
): Snapshot {
  const { channels, unmatched, matchedCount } = aggregatePages(pages);
  return {
    capturedAt: isoMinute(capturedAt),
    channels: attachPlayback(attachPrograms(channels, videos), playback),
    unmatched,
    pageCount: pages.length,
    matchedCount,
  };
}
