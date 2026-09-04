import { NextResponse } from "next/server";
import { audit, readJson, seriesSchema, withAdmin } from "@lib/tvibox/admin";

export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, seriesSchema);
    if (body instanceof NextResponse) return body;
    const { id, ...row } = body;
    const q = id
      ? ctx.supabase.from("tvibox_series").update(row).eq("id", id).select("*").single()
      : ctx.supabase.from("tvibox_series").insert(row).select("*").single();
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await audit(ctx, id ? "tvibox.series.update" : "tvibox.series.create", "tvibox_series", data.id, { slug: data.slug });
    return NextResponse.json({ ok: true, series: data });
  });
}

export async function DELETE(req: Request) {
  return withAdmin(async (ctx) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id em falta" }, { status: 422 });
    if (url.searchParams.get("confirm") !== "1") {
      return NextResponse.json({ ok: false, error: "Confirma a eliminação (confirm=1) — apaga também todos os episódios." }, { status: 409 });
    }
    const { error } = await ctx.supabase.from("tvibox_series").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await audit(ctx, "tvibox.series.delete", "tvibox_series", id);
    return NextResponse.json({ ok: true });
  });
}
