import { NextResponse } from "next/server";
import { audit, jsonError, partySchema, readJson, withAdmin } from "@lib/pt26/admin";
import { PARTY_COLUMNS } from "@lib/pt26/server";

export const runtime = "nodejs";

export async function GET() {
  return withAdmin(async (ctx) => {
    const { data, error } = await ctx.supabase.from("pt26_parties").select(PARTY_COLUMNS).order("sort_order");
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, parties: data ?? [] });
  });
}

/** Cria ou atualiza um partido (sigla, nome, cor, ordem). */
export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, partySchema);
    if (body instanceof NextResponse) return body;
    const { id, ...row } = body;
    const q = id
      ? ctx.supabase.from("pt26_parties").update(row).eq("id", id).select(PARTY_COLUMNS).single()
      : ctx.supabase.from("pt26_parties").insert(row).select(PARTY_COLUMNS).single();
    const { data, error } = await q;
    if (error) return jsonError(/pt26_parties_acronym_key/.test(error.message) ? `Já existe um partido com a sigla «${row.acronym}».` : error.message);
    await audit(ctx, id ? "pt26.party.update" : "pt26.party.create", "pt26_parties", data.id, { acronym: data.acronym });
    return NextResponse.json({ ok: true, party: data });
  });
}

export async function DELETE(req: Request) {
  return withAdmin(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("id em falta", 422);
    const { error } = await ctx.supabase.from("pt26_parties").delete().eq("id", id);
    if (error) return jsonError(error.message);
    await audit(ctx, "pt26.party.delete", "pt26_parties", id);
    return NextResponse.json({ ok: true });
  });
}
