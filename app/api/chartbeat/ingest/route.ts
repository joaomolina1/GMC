import { NextResponse } from "next/server";
import { getChartbeatApiKey } from "@lib/chartbeat/client";
import { ingestNow } from "@lib/chartbeat/ingest";
import { requireAdmin } from "@lib/enterprise/auth";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Snapshot manual (admins). O cron de minuto a minuto é /api/cron/chartbeat-diretos. */
export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const apiKey = getChartbeatApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "CHARTBEAT_API_KEY is not configured" }, { status: 503 });
  }
  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service role unavailable" }, { status: 500 });
  }
  try {
    const snapshot = await ingestNow(supabase, apiKey);
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Ingest failed" }, { status: 500 });
  }
}
