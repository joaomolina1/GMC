import { NextResponse } from "next/server";
import { withAdmin } from "@lib/tvibox/admin";

export const dynamic = "force-dynamic";

const EPISODE_COLUMNS =
  "id, series_id, number, title, synopsis, hook_title, hook_text, is_free, coin_cost, duration_seconds, video_url, poster_url, subtitles_url, render_kind, status, stats_seed, published_at, created_at, updated_at";

export async function GET() {
  return withAdmin(async ({ supabase }) => {
    const [{ data: series, error: e1 }, { data: episodes, error: e2 }] = await Promise.all([
      supabase.from("tvibox_series").select("*").order("sort_order"),
      supabase.from("tvibox_episodes").select(EPISODE_COLUMNS).order("number"),
    ]);
    if (e1 || e2) return NextResponse.json({ ok: false, error: (e1 ?? e2)?.message }, { status: 500 });
    return NextResponse.json({ ok: true, series: series ?? [], episodes: episodes ?? [] });
  });
}
