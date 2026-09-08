import { NextResponse } from "next/server";
import { audit, jsonError, publishSchema, readJson, withAdmin } from "@lib/pt26/admin";
import { WEEK_COLUMNS } from "@lib/pt26/server";

export const runtime = "nodejs";

/** Publicar / despublicar. Só semanas PUBLISHED aparecem ao pivot. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAdmin(async (ctx) => {
    const body = await readJson(req, publishSchema);
    if (body instanceof NextResponse) return body;

    if (body.published) {
      const { count } = await ctx.supabase.from("pt26_quadros").select("id", { count: "exact", head: true }).eq("week_id", id);
      if (!count) return jsonError("A semana não tem resultados — importa o Excel antes de publicar.", 422);
    }

    const { data, error } = await ctx.supabase
      .from("pt26_weeks")
      .update({ status: body.published ? "PUBLISHED" : "DRAFT", published_at: body.published ? new Date().toISOString() : null })
      .eq("id", id)
      .select(WEEK_COLUMNS)
      .single();
    if (error) return jsonError(error.message);
    await audit(ctx, body.published ? "pt26.week.publish" : "pt26.week.unpublish", "pt26_weeks", id, { date: data.date });
    return NextResponse.json({ ok: true, week: data });
  });
}
