import { NextResponse } from "next/server";
import { CHANNELS } from "@lib/chartbeat/channels";
import { buildSnapshot } from "@lib/chartbeat/aggregate";
import { fetchLiveInventory, getChartbeatApiKey } from "@lib/chartbeat/client";
import { persistSnapshot } from "@lib/chartbeat/ingest";
import { mixFromDb } from "@lib/chartbeat/mix";
import { toLivePayload } from "@lib/chartbeat/payload";
import type { ChannelMinute, Snapshot, UnmatchedLive } from "@lib/chartbeat/types";
import { createClient, tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type MinuteRow = {
  captured_at: string;
  channel_slug: string;
  people: number;
  people_web: number;
  people_app: number;
  sources: ChannelMinute["sources"];
  program_title: string | null;
  video_watching: number | null;
  mix?: unknown;
};

async function lastIngest() {
  const sb = await createClient();
  const { data } = await sb
    .from("chartbeat_ingest_runs")
    .select("captured_at, status, error")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    capturedAt: data.captured_at as string,
    status: data.status as string,
    error: (data.error as string | null) ?? null,
  };
}

function snapshotFromRows(capturedAt: string, rows: MinuteRow[], unmatched: UnmatchedLive[] = []): Snapshot {
  const bySlug = new Map(rows.map((r) => [r.channel_slug, r]));
  return {
    capturedAt,
    pageCount: 0,
    matchedCount: rows.reduce((n, r) => n + (Array.isArray(r.sources) ? r.sources.length : 0), 0),
    unmatched,
    channels: CHANNELS.map((c) => {
      const r = bySlug.get(c.slug);
      return {
        slug: c.slug,
        people: r?.people ?? 0,
        web: r?.people_web ?? 0,
        app: r?.people_app ?? 0,
        sources: Array.isArray(r?.sources) ? r.sources : [],
        programTitle: r?.program_title ?? null,
        videoWatching: r?.video_watching ?? null,
        mix: mixFromDb(r?.mix),
      };
    }),
  };
}

async function lastSnapshotFromDb(): Promise<Snapshot | null> {
  const sb = await createClient();
  const { data: run } = await sb
    .from("chartbeat_ingest_runs")
    .select("captured_at, unmatched")
    .eq("status", "ok")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;
  const { data: rows } = await sb
    .from("chartbeat_channel_minutes")
    .select("captured_at, channel_slug, people, people_web, people_app, sources, program_title, video_watching, mix")
    .eq("captured_at", run.captured_at);
  if (!rows?.length) return null;
  const unmatched = Array.isArray(run.unmatched) ? (run.unmatched as UnmatchedLive[]) : [];
  return snapshotFromRows(run.captured_at as string, rows as MinuteRow[], unmatched);
}

/** Concurrents agora: Chartbeat em directo, com fallback ao último minuto gravado. */
export async function GET() {
  const ingest = await lastIngest();
  const apiKey = getChartbeatApiKey();

  if (apiKey) {
    try {
      const { pages, videos, playback } = await fetchLiveInventory(apiKey);
      const snapshot = buildSnapshot(pages, videos, new Date(), playback);
      const service = await tryCreateServiceClient();
      if (service) {
        const lastMinute = ingest?.capturedAt ? new Date(ingest.capturedAt).getTime() : 0;
        const thisMinute = Math.floor(Date.now() / 60_000) * 60_000;
        if (thisMinute > lastMinute) {
          await persistSnapshot(service, snapshot).catch((e) => console.error("[chartbeat/live persist]", e));
        }
      }
      return NextResponse.json(toLivePayload(snapshot, ingest));
    } catch (err) {
      const fallback = await lastSnapshotFromDb();
      if (fallback) {
        return NextResponse.json({
          ...toLivePayload(fallback, ingest),
          stale: true,
          error: err instanceof Error ? err.message : "Chartbeat indisponível",
        });
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Chartbeat indisponível" },
        { status: 502 }
      );
    }
  }

  const fallback = await lastSnapshotFromDb();
  if (fallback) return NextResponse.json(toLivePayload(fallback, ingest));
  return NextResponse.json({ error: "CHARTBEAT_API_KEY is not configured" }, { status: 503 });
}
