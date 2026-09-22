import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot } from "./aggregate";
import { fetchLiveInventory } from "./client";
import { mixToDb } from "./mix";
import type { Snapshot } from "./types";

type Db = SupabaseClient;

export async function collectSnapshot(apiKey: string, at = new Date()): Promise<Snapshot> {
  const { pages, videos, playback } = await fetchLiveInventory(apiKey);
  return buildSnapshot(pages, videos, at, playback);
}

export async function persistSnapshot(sb: Db, snapshot: Snapshot, extra?: { error?: string | null }): Promise<void> {
  const run = {
    captured_at: snapshot.capturedAt,
    status: extra?.error ? "error" : "ok",
    page_count: snapshot.pageCount,
    matched_count: snapshot.matchedCount,
    unmatched: snapshot.unmatched,
    error: extra?.error ?? null,
    finished_at: new Date().toISOString(),
  };

  const { error: runErr } = await sb.from("chartbeat_ingest_runs").upsert(run, { onConflict: "captured_at" });
  if (runErr) throw new Error(`chartbeat_ingest_runs: ${runErr.message}`);

  const rows = snapshot.channels.map((ch) => ({
    captured_at: snapshot.capturedAt,
    channel_slug: ch.slug,
    people: ch.people,
    people_web: ch.web,
    people_app: ch.app,
    sources: ch.sources,
    program_title: ch.programTitle,
    video_watching: ch.videoWatching,
    mix: ch.mix ? mixToDb(ch.mix) : {},
  }));

  const { error: minErr } = await sb.from("chartbeat_channel_minutes").upsert(rows, {
    onConflict: "captured_at,channel_slug",
  });
  if (minErr) throw new Error(`chartbeat_channel_minutes: ${minErr.message}`);
}

export async function ingestNow(sb: Db, apiKey: string): Promise<Snapshot> {
  const snapshot = await collectSnapshot(apiKey);
  await persistSnapshot(sb, snapshot);
  return snapshot;
}
