import { NextResponse } from "next/server";
import { audit, commitSchema, jsonError, readJson, withAdmin } from "@lib/pt26/admin";
import { WEEK_COLUMNS } from "@lib/pt26/server";
import type { ImportReport, ReplaceWeekPayload } from "@lib/pt26/types";

export const runtime = "nodejs";

/** Confirma uma pré-visualização: grava a semana numa transação (RPC), regista o ImportLog, semana em DRAFT. */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, commitSchema);
    if (body instanceof NextResponse) return body;

    const { data: preview, error } = await ctx.supabase
      .from("pt26_import_previews")
      .select("id, week_date, file_name, payload, report, expires_at")
      .eq("id", body.preview_id)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!preview) return jsonError("Pré-visualização não encontrada — volta a carregar o ficheiro.", 404);
    if (new Date(preview.expires_at as string).getTime() < Date.now()) {
      await ctx.supabase.from("pt26_import_previews").delete().eq("id", preview.id);
      return jsonError("A pré-visualização expirou — volta a carregar o ficheiro.", 410);
    }

    const report = preview.report as ImportReport;
    if (report.errors.length > 0) {
      return jsonError("O ficheiro tem erros bloqueantes; corrige-os e volta a carregar.", 422);
    }

    const payload = preview.payload as ReplaceWeekPayload;
    const rpc = await ctx.supabase.rpc("pt26_replace_week", { p_payload: payload, p_keep_status: false });
    if (rpc.error) {
      await ctx.supabase.from("pt26_import_logs").insert({
        week_id: null,
        week_date: preview.week_date,
        file_name: preview.file_name,
        status: "FAILED",
        report: { ...report, commitError: rpc.error.message },
        created_by: ctx.user.id,
      });
      return jsonError(`Erro ao gravar a semana: ${rpc.error.message}`, 500);
    }
    const weekId = rpc.data as string;

    await ctx.supabase.from("pt26_import_logs").insert({
      week_id: weekId,
      week_date: preview.week_date,
      file_name: preview.file_name,
      status: "COMMITTED",
      report: {
        fileName: report.fileName,
        weekDate: report.weekDate,
        weekLabel: report.weekLabel,
        weekExists: report.weekExists,
        errors: [],
        warnings: report.warnings,
        unmatched: report.unmatched,
        questions: [],
      } satisfies ImportReport,
      created_by: ctx.user.id,
    });
    await ctx.supabase.from("pt26_import_previews").delete().eq("id", preview.id);
    await audit(ctx, "pt26.import.commit", "pt26_weeks", weekId, {
      date: preview.week_date,
      file: preview.file_name,
      warnings: report.warnings.length,
      replaced: report.weekExists,
    });

    const { data: week } = await ctx.supabase.from("pt26_weeks").select(WEEK_COLUMNS).eq("id", weekId).single();
    return NextResponse.json({ ok: true, week });
  });
}
