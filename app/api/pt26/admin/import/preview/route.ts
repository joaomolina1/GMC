import { NextResponse } from "next/server";
import { ISO_DATE, jsonError, withAdmin } from "@lib/pt26/admin";
import { parseWorkbook, toReplaceWeekPayload } from "@lib/pt26/excel";
import { defaultWeekLabel, loadReference } from "@lib/pt26/server";
import type { ImportIssue, ImportReport } from "@lib/pt26/types";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const XLSX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

/**
 * Upload do Excel semanal → pré-visualização completa (valores lidos, matches, erros e avisos).
 * Nada é gravado nas tabelas de resultados; a pré-visualização fica em `pt26_import_previews`
 * até ser confirmada em /commit (ou expirar).
 */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError("Pedido inválido (multipart esperado)", 422);
    const file = form.get("file");
    const date = String(form.get("date") ?? "").trim();
    const labelInput = String(form.get("label") ?? "").trim();

    if (!(file instanceof File)) return jsonError("Ficheiro em falta", 422);
    if (!ISO_DATE.test(date)) return jsonError("Data da semana inválida (AAAA-MM-DD)", 422);
    if (file.size > MAX_BYTES) return jsonError("Ficheiro demasiado grande (máx. 4 MB)", 413);
    if (file.type && !XLSX_TYPES.has(file.type) && !/\.xlsx?$/i.test(file.name)) {
      return jsonError("Formato não suportado — envia um ficheiro .xlsx", 422);
    }

    const ref = await loadReference(ctx.supabase);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseWorkbook(bytes, { questions: ref.questions, matcher: ref.matcher });
    } catch (e) {
      return jsonError(`Não foi possível ler o Excel: ${e instanceof Error ? e.message : "ficheiro inválido"}`, 422);
    }

    const { label: defaultLabel, exists } = await defaultWeekLabel(ctx.supabase, date);
    const weekLabel = labelInput || defaultLabel;

    const warnings: ImportIssue[] = parsed.issues.filter((i) => i.level === "warning");
    if (exists) {
      warnings.unshift({
        level: "warning",
        code: "week_exists",
        message: `Já existe uma semana com a data ${date}: os quadros e resultados serão substituídos e a semana volta a «Rascunho».`,
      });
    }
    if (parsed.metaDate && parsed.metaDate !== date) {
      warnings.push({
        level: "warning",
        code: "meta_date_mismatch",
        sheet: "META",
        message: `A sheet META indica ${parsed.metaDate}, mas a data escolhida é ${date}. Prevalece a data escolhida.`,
      });
    }

    const report: ImportReport = {
      fileName: file.name,
      weekDate: date,
      weekLabel,
      weekExists: exists,
      errors: parsed.issues.filter((i) => i.level === "error"),
      warnings,
      unmatched: parsed.questions.flatMap((q) =>
        q.quadros.flatMap((quadro) =>
          quadro.items
            .filter((it) => !it.matched)
            .map((it) => ({ sheet: q.sheet ?? `P${q.number}`, quadro: quadro.idx, item: it.raw, kind: q.kind }))
        )
      ),
      questions: parsed.questions,
    };

    const payload = toReplaceWeekPayload(parsed, { date, label: weekLabel, sourceFileName: file.name });

    // limpeza de pré-visualizações expiradas (barato, evita crescimento)
    await ctx.supabase.from("pt26_import_previews").delete().lt("expires_at", new Date().toISOString());

    const { data, error } = await ctx.supabase
      .from("pt26_import_previews")
      .insert({ week_date: date, file_name: file.name, payload, report, created_by: ctx.user.id })
      .select("id, expires_at")
      .single();
    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, preview_id: data.id, expires_at: data.expires_at, report });
  });
}
