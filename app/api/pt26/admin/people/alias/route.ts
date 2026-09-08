import { NextResponse } from "next/server";
import { aliasSchema, audit, jsonError, readJson, withAdmin } from "@lib/pt26/admin";
import { PERSON_COLUMNS } from "@lib/pt26/server";
import type { PersonRow } from "@lib/pt26/types";

export const runtime = "nodejs";

/** Acrescenta um nome alternativo a uma pessoa (ex.: item do Excel que não fez match). */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, aliasSchema);
    if (body instanceof NextResponse) return body;
    const { data: person, error } = await ctx.supabase.from("pt26_people").select(PERSON_COLUMNS).eq("id", body.person_id).maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!person) return jsonError("Pessoa não encontrada", 404);
    const current = (person as PersonRow).aliases ?? [];
    const aliases = current.some((a) => a.toLowerCase() === body.alias.toLowerCase()) ? current : [...current, body.alias];
    const { data, error: upErr } = await ctx.supabase.from("pt26_people").update({ aliases }).eq("id", body.person_id).select(PERSON_COLUMNS).single();
    if (upErr) return jsonError(upErr.message);
    await audit(ctx, "pt26.person.alias", "pt26_people", body.person_id, { alias: body.alias });
    return NextResponse.json({ ok: true, person: data });
  });
}
