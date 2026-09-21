import { NextResponse } from "next/server";
import { historySpec } from "@lib/chartbeat/format";
import { emptyHistory, parseHistoryRows } from "@lib/chartbeat/payload";
import type { HistoryRange } from "@lib/chartbeat/types";
import { createClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = new Set<HistoryRange>(["6h", "24h", "7d", "30d"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("range") ?? "24h") as HistoryRange;
  const range: HistoryRange = RANGES.has(raw) ? raw : "24h";
  const spec = historySpec(range);
  const from = new Date(Date.now() - spec.ms);

  const sb = await createClient();
  const { data, error } = await sb.rpc("chartbeat_history", {
    p_from: from.toISOString(),
    p_bucket_seconds: spec.bucketSeconds,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = emptyHistory(range, from);
  payload.points = parseHistoryRows((data ?? []) as { bucket: string; people: Record<string, number> }[]);
  return NextResponse.json(payload);
}
