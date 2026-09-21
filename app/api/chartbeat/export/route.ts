import { NextResponse } from "next/server";
import { csvFilename, historyToCsv } from "@lib/chartbeat/csv";
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
    const points = await fetchHistoryBundle(sb, from, grain);
    const csv = historyToCsv(points, grain);
    const filename = csvFilename(range, grain);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Exportação indisponível" }, { status: 500 });
  }
}
