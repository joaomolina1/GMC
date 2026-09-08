import { NextResponse } from "next/server";
import { audit, jsonError, personSchema, readJson, withAdmin } from "@lib/pt26/admin";
import { PERSON_COLUMNS } from "@lib/pt26/server";

export const runtime = "nodejs";

export async function GET() {
  return withAdmin(async (ctx) => {
    const { data, error } = await ctx.supabase.from("pt26_people").select(PERSON_COLUMNS).order("name");
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, people: data ?? [] });
  });
}

/** Cria ou atualiza uma pessoa (nome, cargo, tipo, partido, aliases). */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, personSchema);
    if (body instanceof NextResponse) return body;
    const { id, ...rest } = body;
    const row = {
      ...rest,
      role: rest.role?.trim() || null,
      party_id: rest.party_id ?? null,
      aliases: Array.from(new Set((rest.aliases ?? []).map((a) => a.trim()).filter(Boolean))),
    };
    const q = id
      ? ctx.supabase.from("pt26_people").update(row).eq("id", id).select(PERSON_COLUMNS).single()
      : ctx.supabase.from("pt26_people").insert(row).select(PERSON_COLUMNS).single();
    const { data, error } = await q;
    if (error) return jsonError(/pt26_people_name_key/.test(error.message) ? `Já existe uma pessoa chamada «${row.name}».` : error.message);
    await audit(ctx, id ? "pt26.person.update" : "pt26.person.create", "pt26_people", data.id, { name: data.name });
    return NextResponse.json({ ok: true, person: data });
  });
}

export async function DELETE(req: Request) {
  return withAdmin(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("id em falta", 422);
    const { error } = await ctx.supabase.from("pt26_people").delete().eq("id", id);
    if (error) return jsonError(error.message);
    await audit(ctx, "pt26.person.delete", "pt26_people", id);
    return NextResponse.json({ ok: true });
  });
}
