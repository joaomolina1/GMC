import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, readJson, seriesSchema, withAdmin } from "@lib/tvibox/admin";
import { removeStoragePaths, seriesMediaPaths } from "@lib/tvibox/media-purge";
import { TVIBOX_BUCKET } from "@lib/tvibox/media";
import { createServiceClient } from "@lib/supabase/server";

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
      return NextResponse.json({ ok: false, error: "Confirma a eliminação (confirm=1) — apaga também todos os episódios e os ficheiros no Storage." }, { status: 409 });
    }

    const { data: series, error: readError } = await ctx.supabase.from("tvibox_series").select("id, slug, poster_url").eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 400 });
    if (!series) return NextResponse.json({ ok: false, error: "Série não encontrada" }, { status: 404 });
    const { data: episodes, error: episodeError } = await ctx.supabase
      .from("tvibox_episodes")
      .select("video_url, poster_url, subtitles_url")
      .eq("series_id", id);
    if (episodeError) return NextResponse.json({ ok: false, error: episodeError.message }, { status: 400 });

    const urls = [series.poster_url as string | null];
    for (const episode of episodes ?? []) {
      urls.push(episode.video_url, episode.poster_url, episode.subtitles_url);
    }
    const service = await createServiceClient();
    const paths = await seriesMediaPaths(service.storage, series.slug as string, urls);
    const removed = await removeStoragePaths(service.storage, TVIBOX_BUCKET, paths);

    const { error } = await ctx.supabase.from("tvibox_series").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Os ficheiros saíram do Storage (${removed}), mas a série ficou: ${error.message}` },
        { status: 400 }
      );
    }
    await audit(ctx, "tvibox.series.delete", "tvibox_series", id, { storage_removed: removed });
    return NextResponse.json({ ok: true, removed });
  });
}
