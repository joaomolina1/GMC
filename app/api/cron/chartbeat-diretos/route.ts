import { NextResponse } from "next/server";
import { getChartbeatApiKey } from "@lib/chartbeat/client";
import { ingestNow } from "@lib/chartbeat/ingest";
import { cronUnauthorized } from "@lib/cron/auth";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Cron Vercel a cada minuto: snapshot Chartbeat toppages → Postgres. */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  const apiKey = getChartbeatApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "CHARTBEAT_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  try {
    const snapshot = await ingestNow(supabase, apiKey);
    return NextResponse.json({
      ok: true,
      capturedAt: snapshot.capturedAt,
      matched: snapshot.matchedCount,
      pages: snapshot.pageCount,
      channels: Object.fromEntries(snapshot.channels.map((c) => [c.slug, c.people])),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    console.error("[cron/chartbeat-diretos]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
