import { NextResponse } from "next/server";
import { audit, jsonError, questionPatchSchema, readJson, withAdmin } from "@lib/pt26/admin";
import { QUESTION_COLUMNS } from "@lib/pt26/server";

export const runtime = "nodejs";

export async function GET() {
  return withAdmin(async (ctx) => {
    const { data, error } = await ctx.supabase.from("pt26_questions").select(QUESTION_COLUMNS).order("number");
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, questions: data ?? [] });
  });
}

/** Só título e subtítulo são editáveis; tipo, sinal e número são fixos (seed). */
export async function PATCH(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, questionPatchSchema);
    if (body instanceof NextResponse) return body;
    const { data, error } = await ctx.supabase
      .from("pt26_questions")
      .update({ title: body.title, subtitle: body.subtitle?.trim() || null })
      .eq("id", body.id)
      .select(QUESTION_COLUMNS)
      .single();
    if (error) return jsonError(error.message);
    await audit(ctx, "pt26.question.update", "pt26_questions", body.id, { title: body.title });
    return NextResponse.json({ ok: true, question: data });
  });
}
