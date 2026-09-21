import { NextResponse } from "next/server";
import { emptyHistory } from "@lib/chartbeat/payload";
import { historySpec, parseHistoryGrain, parseHistoryRange } from "@lib/chartbeat/format";
import { fetchHistoryBundle } from "@lib/chartbeat/query";
import { createClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = parseHistoryRange(url.searchParams.get("range"));
  const grain = parseHistoryGrain(url.searchParams.get("grain"), range);
  const spec = historySpec(range);
  const from = new Date(Date.now() - spec.ms);

  const sb = await createClient();
  try {
    const payload = emptyHistory(range, grain, from);
    payload.points = await fetchHistoryBundle(sb, from, grain);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Histórico indisponível" }, { status: 500 });
  }
}
