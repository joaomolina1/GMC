import { NextResponse } from "next/server";
import { audit, episodeSchema, readJson, withAdmin } from "@lib/tvibox/admin";
import { episodeMediaPaths, removeStoragePaths } from "@lib/tvibox/media-purge";
import { TVIBOX_BUCKET } from "@lib/tvibox/media";
import { createServiceClient } from "@lib/supabase/server";

export async function POST(req: Request) {
  return withAdmin(async (ctx) => {
    const body = await readJson(req, episodeSchema);
    if (body instanceof NextResponse) return body;
    const { id, ...row } = body;

    if (row.status === "published" && !row.video_url) {
      return NextResponse.json(
        { ok: false, error: "Para publicar, o episódio precisa de vídeo. Usa «Em breve» para o mostrar bloqueado como cliffhanger." },
        { status: 422 }
      );
    }
    const patch: Record<string, unknown> = { ...row };
    if (row.video_url && !row.render_kind) patch.render_kind = "final";
    if (!row.video_url) patch.render_kind = "none";
    if (row.status === "published") patch.published_at = new Date().toISOString();

    const q = id
      ? ctx.supabase.from("tvibox_episodes").update(patch).eq("id", id).select("*").single()
      : ctx.supabase.from("tvibox_episodes").insert(patch).select("*").single();
    const { data, error } = await q;
    if (error) {
      const msg = /tvibox_episodes_series_id_number_key/.test(error.message) ? `Já existe um episódio n.º ${row.number} nesta série.` : error.message;
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    await audit(ctx, id ? "tvibox.episode.update" : "tvibox.episode.create", "tvibox_episodes", data.id, {
      series_id: data.series_id,
      number: data.number,
      status: data.status,
    });
    return NextResponse.json({ ok: true, episode: data });
  });
}

export async function DELETE(req: Request) {
  return withAdmin(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id em falta" }, { status: 422 });

    const { data, error: readError } = await ctx.supabase
      .from("tvibox_episodes")
      .select("id, number, video_url, poster_url, subtitles_url, tvibox_series(slug)")
      .eq("id", id)
      .maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Episódio não encontrado" }, { status: 404 });

    const row = data as {
      number: number;
      video_url: string | null;
      poster_url: string | null;
      subtitles_url: string | null;
      tvibox_series: { slug: string } | { slug: string }[] | null;
    };
    const series = Array.isArray(row.tvibox_series) ? row.tvibox_series[0] : row.tvibox_series;
    if (!series?.slug) return NextResponse.json({ ok: false, error: "Série do episódio não encontrada" }, { status: 400 });

    const service = await createServiceClient();
    const paths = await episodeMediaPaths(service.storage, series.slug, row.number, [row.video_url, row.poster_url, row.subtitles_url]);
    const removed = await removeStoragePaths(service.storage, TVIBOX_BUCKET, paths);

    const { error } = await ctx.supabase.from("tvibox_episodes").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Os ficheiros saíram do Storage (${removed}), mas a linha ficou: ${error.message}` },
        { status: 400 }
      );
    }
    await audit(ctx, "tvibox.episode.delete", "tvibox_episodes", id, { storage_removed: removed });
    return NextResponse.json({ ok: true, removed });
  });
}
