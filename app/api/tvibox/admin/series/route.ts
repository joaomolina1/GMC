import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, readJson, seriesSchema, withAdmin } from "@lib/tvibox/admin";

const reorderSchema = z.object({ order: z.array(z.string().uuid()).min(1).max(200) });

/** Reordena as séries no feed: `order` é a lista completa de ids, do primeiro ao último. */
export async function PATCH(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, reorderSchema);
    if (body instanceof NextResponse) return body;
    const results = await Promise.all(
      body.order.map((id, i) => ctx.supabase.from("tvibox_series").update({ sort_order: i + 1 }).eq("id", id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 400 });
    await audit(ctx, "tvibox.series.reorder", "tvibox_series", undefined, { order: body.order });
    const { data } = await ctx.supabase.from("tvibox_series").select("*").order("sort_order");
    return NextResponse.json({ ok: true, series: data ?? [] });
  });
}

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
