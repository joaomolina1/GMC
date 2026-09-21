import { CHARTBEAT_HOSTS } from "./channels";
import type { ChartbeatHost, ChartbeatPage, ChartbeatVideo } from "./types";

const TOPPAGES = "https://api.chartbeat.com/live/toppages/v3/";
const VIDEOS = "https://api.chartbeat.com/live/video/videos/v1/";

export function getChartbeatApiKey(): string | undefined {
  return process.env.CHARTBEAT_API_KEY?.trim() || undefined;
}

async function chartbeatGet(url: string, apiKey: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "X-CB-AK": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chartbeat HTTP ${res.status} ${url}: ${body.slice(0, 240)}`);
  }
  return res.json();
}

function asPages(payload: unknown, fallbackHost: string): ChartbeatPage[] {
  if (!payload || typeof payload !== "object") return [];
  const pages = (payload as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  const out: ChartbeatPage[] = [];
  for (const raw of pages) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const stats = (p.stats && typeof p.stats === "object" ? p.stats : {}) as Record<string, unknown>;
    const people = Number(stats.people ?? 0);
    const platform = stats.platform && typeof stats.platform === "object" ? (stats.platform as ChartbeatPage["platform"]) : undefined;
    out.push({
      host: String(p.host || fallbackHost),
      path: String(p.path || ""),
      title: String(p.title || ""),
      people: Number.isFinite(people) ? people : 0,
      platform,
    });
  }
  return out;
}

function asVideos(payload: unknown): ChartbeatVideo[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { data?: { items?: unknown } }).data?.items;
  if (!Array.isArray(items)) return [];
  const out: ChartbeatVideo[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const stats = (v.stats && typeof v.stats === "object" ? v.stats : {}) as Record<string, unknown>;
    out.push({
      path: String(v.path || ""),
      title: String(v.title || ""),
      watching: Number(stats.watching ?? 0) || 0,
      visitors: Number(stats.visitors ?? 0) || 0,
      thumbnail: typeof v.thumbnail === "string" ? v.thumbnail : undefined,
    });
  }
  return out;
}

export async function fetchTopPages(host: ChartbeatHost, apiKey: string, limit = 100): Promise<ChartbeatPage[]> {
  const url = `${TOPPAGES}?host=${encodeURIComponent(host)}&limit=${limit}&all_platforms=1`;
  return asPages(await chartbeatGet(url, apiKey), host);
}

export async function fetchTopVideos(host: ChartbeatHost, apiKey: string, limit = 20): Promise<ChartbeatVideo[]> {
  const url = `${VIDEOS}?host=${encodeURIComponent(`video@${host}`)}&limit=${limit}`;
  try {
    return asVideos(await chartbeatGet(url, apiKey));
  } catch {
    // Video add-on pode falhar num host; o dado principal é toppages.
    return [];
  }
}

export async function fetchLiveInventory(apiKey: string): Promise<{
  pages: ChartbeatPage[];
  videos: ChartbeatVideo[];
}> {
  const pageResults = await Promise.all(CHARTBEAT_HOSTS.map((h) => fetchTopPages(h.host, apiKey)));
  const videoResults = await Promise.all(CHARTBEAT_HOSTS.map((h) => fetchTopVideos(h.host, apiKey)));
  return {
    pages: pageResults.flat(),
    videos: videoResults.flat(),
  };
}
