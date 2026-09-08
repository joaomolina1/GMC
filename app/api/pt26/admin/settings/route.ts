import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { audit, jsonError, readJson, settingsPatchSchema, withAdmin } from "@lib/pt26/admin";

export const runtime = "nodejs";

const COLUMNS = "live_token, footer_text, logo_year, updated_at";

export async function GET() {
  return withAdmin(async (ctx) => {
    const { data, error } = await ctx.supabase.from("pt26_settings").select(COLUMNS).eq("id", 1).maybeSingle();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, settings: data ?? { live_token: null, footer_text: null, logo_year: "26" } });
  });
}

/** Token do ecrã (ou regeneração), texto do rodapé (fonte da sondagem) e ano do logo. */
export async function PATCH(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, settingsPatchSchema);
    if (body instanceof NextResponse) return body;
    const patch: Record<string, unknown> = {};
    if (body.regenerate_token) patch.live_token = randomBytes(12).toString("hex");
    else if (body.live_token !== undefined) patch.live_token = body.live_token?.trim() || null;
    if (body.footer_text !== undefined) patch.footer_text = body.footer_text?.trim() || null;
    if (body.logo_year !== undefined) patch.logo_year = body.logo_year;
    if (Object.keys(patch).length === 0) return jsonError("Nada para atualizar", 422);

    const { data, error } = await ctx.supabase
      .from("pt26_settings")
      .upsert({ id: 1, ...patch }, { onConflict: "id" })
      .select(COLUMNS)
      .single();
    if (error) return jsonError(error.message);
    await audit(ctx, "pt26.settings.update", "pt26_settings", "1", { fields: Object.keys(patch) });
    return NextResponse.json({ ok: true, settings: data });
  });
}
