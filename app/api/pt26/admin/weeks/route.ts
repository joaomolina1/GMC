import { NextResponse } from "next/server";
import { withAdmin } from "@lib/pt26/admin";
import { WEEK_COLUMNS, loadImportLogs } from "@lib/pt26/server";
import type { WeekRow } from "@lib/pt26/types";

export const runtime = "nodejs";

export interface WeekListItem extends WeekRow {
  quadros: number;
  warnings: number;
  unmatched: number;
  last_import_at: string | null;
}

/** Lista de semanas (todas, mais recente primeiro) com resumo do último import. */
export async function GET() {
  return withAdmin(async (ctx) => {
    const [{ data: weeks, error }, { data: quadros }, logs] = await Promise.all([
      ctx.supabase.from("pt26_weeks").select(WEEK_COLUMNS).order("date", { ascending: false }),
      ctx.supabase.from("pt26_quadros").select("week_id"),
      loadImportLogs(ctx.supabase, 200),
    ]);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const quadroCount = new Map<string, number>();
    for (const q of (quadros ?? []) as { week_id: string }[]) quadroCount.set(q.week_id, (quadroCount.get(q.week_id) ?? 0) + 1);

    const items: WeekListItem[] = ((weeks ?? []) as unknown as WeekRow[]).map((w) => {
      const log = logs.find((l) => l.week_id === w.id && l.status === "COMMITTED");
      return {
        ...w,
        quadros: quadroCount.get(w.id) ?? 0,
        warnings: log?.report.warnings?.length ?? 0,
        unmatched: log?.report.unmatched?.length ?? 0,
        last_import_at: log?.created_at ?? null,
      };
    });
    return NextResponse.json({ ok: true, weeks: items });
  });
}
