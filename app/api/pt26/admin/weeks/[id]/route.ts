import { NextResponse } from "next/server";
import { audit, jsonError, readJson, weekPatchSchema, weekSaveSchema, withAdmin, type AdminContext } from "@lib/pt26/admin";
import { QUADRO_COLUMNS, RESULT_COLUMNS, WEEK_COLUMNS, loadImportLogs, loadReference } from "@lib/pt26/server";
import type { QuadroRow, ReplaceWeekPayload, ResultRow, WeekRow } from "@lib/pt26/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function loadWeek(ctx: AdminContext, id: string): Promise<WeekRow | null> {
  const { data, error } = await ctx.supabase.from("pt26_weeks").select(WEEK_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WeekRow | null) ?? null;
}

/** Detalhe de uma semana para edição: quadros com resultados (por pergunta) e histórico de imports. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const week = await loadWeek(ctx, id);
    if (!week) return jsonError("Semana não encontrada", 404);
    const [ref, quadros, logs] = await Promise.all([
      loadReference(ctx.supabase),
      ctx.supabase.from("pt26_quadros").select(QUADRO_COLUMNS).eq("week_id", id).order("idx"),
      loadImportLogs(ctx.supabase, 100),
    ]);
    if (quadros.error) return jsonError(quadros.error.message, 500);
    const quadroRows = (quadros.data ?? []) as unknown as QuadroRow[];
    const results = quadroRows.length
      ? await ctx.supabase.from("pt26_results").select(RESULT_COLUMNS).in("quadro_id", quadroRows.map((q) => q.id)).order("sort_order")
      : { data: [], error: null };
    if (results.error) return jsonError(results.error.message, 500);
    const resultRows = (results.data ?? []) as unknown as ResultRow[];
    const questionById = new Map(ref.questions.map((q) => [q.id, q]));

    return NextResponse.json({
      ok: true,
      week,
      quadros: quadroRows
        .map((q) => ({
          ...q,
          question_number: questionById.get(q.question_id)?.number ?? 0,
          results: resultRows.filter((r) => r.quadro_id === q.id).map((r) => ({ ...r, value: Number(r.value) })),
        }))
        .sort((a, b) => a.question_number - b.question_number || a.idx - b.idx),
      logs: logs.filter((l) => l.week_id === id || l.week_date === week.date),
    });
  });
}

/** Rótulo / data da semana. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const body = await readJson(req, weekPatchSchema);
    if (body instanceof NextResponse) return body;
    if (!body.label && !body.date) return jsonError("Nada para atualizar", 422);
    const { data, error } = await ctx.supabase.from("pt26_weeks").update(body).eq("id", id).select(WEEK_COLUMNS).single();
    if (error) return jsonError(/pt26_weeks_date_key/.test(error.message) ? "Já existe uma semana com essa data." : error.message);
    await audit(ctx, "pt26.week.update", "pt26_weeks", id, body);
    return NextResponse.json({ ok: true, week: data });
  });
}

/**
 * Edição manual: substitui todos os quadros/resultados da semana (mesma RPC do import, estado mantido).
 * Itens sem pessoa/partido são reemparelhados no servidor.
 */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const body = await readJson(req, weekSaveSchema);
    if (body instanceof NextResponse) return body;
    const week = await loadWeek(ctx, id);
    if (!week) return jsonError("Semana não encontrada", 404);
    const ref = await loadReference(ctx.supabase);
    const kindOf = new Map(ref.questions.map((q) => [q.number, q.kind]));

    const payload: ReplaceWeekPayload = {
      date: week.date,
      label: body.label ?? week.label,
      quadros: body.quadros.map((q) => {
        const kind = kindOf.get(q.question_number) ?? "RANKING";
        const seen = new Set<string>();
        return {
          question_number: q.question_number,
          idx: q.idx,
          title: q.title?.trim() || null,
          person_id: q.person_id ?? null,
          results: q.results.map((r, i) => {
            const match = r.person_id || r.party_id ? null : ref.matcher.matchItem(r.item_key, kind);
            const key = match ? match.key : r.item_key.trim();
            if (seen.has(key.toLowerCase())) throw new Error(`P${q.question_number} quadro ${q.idx}: item «${key}» repetido.`);
            seen.add(key.toLowerCase());
            return {
              item_key: key,
              value: r.value,
              person_id: r.person_id ?? match?.personId ?? null,
              party_id: r.party_id ?? match?.partyId ?? null,
              sort_order: i,
            };
          }),
        };
      }),
    };

    const rpc = await ctx.supabase.rpc("pt26_replace_week", { p_payload: payload, p_keep_status: true });
    if (rpc.error) return jsonError(rpc.error.message, 500);
    await audit(ctx, "pt26.week.edit", "pt26_weeks", id, { quadros: payload.quadros.length });
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    if (new URL(req.url).searchParams.get("confirm") !== "1") {
      return jsonError("Confirma a eliminação (confirm=1) — apaga todos os quadros e resultados da semana.", 409);
    }
    const { error } = await ctx.supabase.from("pt26_weeks").delete().eq("id", id);
    if (error) return jsonError(error.message);
    await audit(ctx, "pt26.week.delete", "pt26_weeks", id);
    return NextResponse.json({ ok: true });
  });
}
