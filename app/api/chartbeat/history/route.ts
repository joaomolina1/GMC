import { NextResponse } from "next/server";
import { emptyHistory } from "@lib/chartbeat/payload";
import { fetchHistoryBundle } from "@lib/chartbeat/query";
import { resolveHistoryWindow } from "@lib/chartbeat/window";
import { createClient } from "@lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = resolveHistoryWindow({
    range: url.searchParams.get("range"),
    grain: url.searchParams.get("grain"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { range, grain, from, to } = resolved.window;

  const sb = await createClient();
  try {
    const payload = emptyHistory(range, grain, from, to);
    payload.points = await fetchHistoryBundle(sb, from, grain, to);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Histórico indisponível" }, { status: 500 });
  }
}
