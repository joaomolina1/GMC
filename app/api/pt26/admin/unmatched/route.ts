import { NextResponse } from "next/server";
import { jsonError, withAdmin } from "@lib/pt26/admin";
import { canonicalAnswer } from "@lib/pt26/normalize";
import { loadReference } from "@lib/pt26/server";

export const runtime = "nodejs";

export interface UnmatchedItem {
  /** Texto tal como veio do Excel. */
  item: string;
  /** "result" (item sem pessoa/partido) ou "quadro" (cara do quadro P6 sem pessoa). */
  source: "result" | "quadro";
  occurrences: { week_date: string; week_label: string; question_number: number; quadro_idx: number }[];
}

/** Itens dos imports que não fizeram match com nenhuma pessoa/partido (dados atuais, não do log). */
export async function GET() {
  return withAdmin(async (ctx) => {
    const ref = await loadReference(ctx.supabase);
    const questionById = new Map(ref.questions.map((q) => [q.id, q]));

    const [{ data: quadros, error: qErr }, { data: weeks, error: wErr }] = await Promise.all([
      ctx.supabase.from("pt26_quadros").select("id, week_id, question_id, idx, title, person_id"),
      ctx.supabase.from("pt26_weeks").select("id, date, label"),
    ]);
    if (qErr) return jsonError(qErr.message, 500);
    if (wErr) return jsonError(wErr.message, 500);
    const weekById = new Map((weeks ?? []).map((w: { id: string; date: string; label: string }) => [w.id, w]));
    const quadroById = new Map((quadros ?? []).map((q: { id: string }) => [q.id, q]));

    const { data: results, error: rErr } = await ctx.supabase
      .from("pt26_results")
      .select("quadro_id, item_key")
      .is("person_id", null)
      .is("party_id", null);
    if (rErr) return jsonError(rErr.message, 500);

    const groups = new Map<string, UnmatchedItem>();
    const add = (item: string, source: UnmatchedItem["source"], quadro: { week_id: string; question_id: string; idx: number }) => {
      const key = `${source}:${item.toLowerCase()}`;
      const week = weekById.get(quadro.week_id);
      const question = questionById.get(quadro.question_id);
      const g = groups.get(key) ?? { item, source, occurrences: [] };
      g.occurrences.push({ week_date: week?.date ?? "", week_label: week?.label ?? "", question_number: question?.number ?? 0, quadro_idx: quadro.idx });
      groups.set(key, g);
    };

    for (const r of (results ?? []) as { quadro_id: string; item_key: string }[]) {
      if (canonicalAnswer(r.item_key)) continue;
      const quadro = quadroById.get(r.quadro_id) as { week_id: string; question_id: string; idx: number } | undefined;
      if (quadro) add(r.item_key, "result", quadro);
    }
    for (const q of (quadros ?? []) as { week_id: string; question_id: string; idx: number; title: string | null; person_id: string | null }[]) {
      if (questionById.get(q.question_id)?.kind === "MINISTER" && !q.person_id && q.title) add(q.title, "quadro", q);
    }

    const items = Array.from(groups.values()).sort((a, b) => b.occurrences.length - a.occurrences.length || a.item.localeCompare(b.item));
    return NextResponse.json({ ok: true, items });
  });
}
