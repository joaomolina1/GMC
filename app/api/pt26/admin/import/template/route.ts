import { withAdmin } from "@lib/pt26/admin";
import { buildTemplateWorkbook, defaultTemplateQuestions, type TemplateQuestion } from "@lib/pt26/excel";
import { loadReference, loadWeeks } from "@lib/pt26/server";

export const runtime = "nodejs";

/** Excel modelo: 8 sheets com cabeçalhos e os itens da última semana importada (ou os itens por defeito). */
export async function GET() {
  return withAdmin(async (ctx) => {
    const ref = await loadReference(ctx.supabase);
    const { weeks, quadros, results } = await loadWeeks(ctx.supabase, { includeDrafts: true });
    const last = weeks.at(-1);

    let questions: TemplateQuestion[];
    if (last) {
      const peopleById = new Map(ref.people.map((p) => [p.id, p.name]));
      questions = [...ref.questions]
        .sort((a, b) => a.number - b.number)
        .map((q) => {
          const qs = quadros
            .filter((x) => x.week_id === last.id && x.question_id === q.id)
            .sort((a, b) => a.idx - b.idx)
            .map((x) => ({
              idx: x.idx,
              title: x.title,
              personName: x.person_id ? (peopleById.get(x.person_id) ?? null) : q.kind === "MINISTER" ? "" : null,
              items: results
                .filter((r) => r.quadro_id === x.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((r) => r.item_key),
            }));
          return { number: q.number, title: q.title, kind: q.kind, quadros: qs.length ? qs : defaultTemplateQuestions([q], ref.parties.map((p) => p.acronym))[0].quadros };
        });
    } else {
      questions = defaultTemplateQuestions(ref.questions, ref.parties.map((p) => p.acronym));
    }

    const nextDate = last ? addDays(last.date, 7) : undefined;
    const bytes = buildTemplateWorkbook(questions, nextDate);
    const filename = `pt26-template${nextDate ? `-${nextDate}` : ""}.xlsx`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
