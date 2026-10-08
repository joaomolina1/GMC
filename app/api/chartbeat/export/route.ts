import { NextResponse } from "next/server";
import { csvFilename, historyToCsv } from "@lib/chartbeat/csv";
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
    const points = await fetchHistoryBundle(sb, from, grain, to);
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
