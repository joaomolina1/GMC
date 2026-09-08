import { NextResponse } from "next/server";
import { audit, jsonError, withAdmin } from "@lib/pt26/admin";
import { canonicalAnswer } from "@lib/pt26/normalize";
import { loadReference } from "@lib/pt26/server";

export const runtime = "nodejs";

/**
 * Volta a tentar emparelhar pessoas/partidos nos resultados sem correspondência (depois de criar
 * uma pessoa ou acrescentar um alias) e nas caras dos quadros P6 sem pessoa.
 */
export async function POST() {
  return withAdmin(async (ctx) => {
    const ref = await loadReference(ctx.supabase);
    const questionById = new Map(ref.questions.map((q) => [q.id, q]));

    const [{ data: quadros, error: qErr }, { data: results, error: rErr }] = await Promise.all([
      ctx.supabase.from("pt26_quadros").select("id, question_id, idx, title, person_id"),
      ctx.supabase.from("pt26_results").select("id, quadro_id, item_key").is("person_id", null).is("party_id", null),
    ]);
    if (qErr) return jsonError(qErr.message, 500);
    if (rErr) return jsonError(rErr.message, 500);
    const quadroById = new Map((quadros ?? []).map((q: { id: string }) => [q.id, q]));

    let updatedResults = 0;
    for (const r of (results ?? []) as { id: string; quadro_id: string; item_key: string }[]) {
      if (canonicalAnswer(r.item_key)) continue;
      const quadro = quadroById.get(r.quadro_id) as { question_id: string } | undefined;
      const kind = quadro ? questionById.get(quadro.question_id)?.kind ?? "RANKING" : "RANKING";
      const match = ref.matcher.matchItem(r.item_key, kind);
      if (match.kind === "person" || match.kind === "party") {
        const { error } = await ctx.supabase
          .from("pt26_results")
          .update({ item_key: match.key, person_id: match.personId, party_id: match.partyId })
          .eq("id", r.id);
        if (!error) updatedResults++;
      }
    }

    let updatedQuadros = 0;
    for (const q of (quadros ?? []) as { id: string; question_id: string; title: string | null; person_id: string | null }[]) {
      if (q.person_id || !q.title || questionById.get(q.question_id)?.kind !== "MINISTER") continue;
      const person = ref.matcher.matchPerson(q.title);
      if (person) {
        const { error } = await ctx.supabase.from("pt26_quadros").update({ person_id: person.id, title: null }).eq("id", q.id);
        if (!error) updatedQuadros++;
      }
    }

    await audit(ctx, "pt26.rematch", "pt26_results", undefined, { updatedResults, updatedQuadros });
    return NextResponse.json({ ok: true, updatedResults, updatedQuadros });
  });
}
