/**
 * Semeia o catálogo TVI BOX (séries + episódios + argumentos) no Supabase.
 *
 *   npx tsx scripts/tvibox/seed.ts
 *
 * Idempotente: faz upsert por slug (séries) e por (série, número) nos episódios.
 * Não toca em video_url/duration/render_kind quando já existem (geridos pelos scripts de media).
 */
import { EPISODES, SERIES } from "../../lib/tvibox/catalog";
import { SCREENPLAYS, screenplayDuration, MAX_EPISODE_SECONDS } from "../../lib/tvibox/screenplays";
import { posterPublicUrl } from "../../lib/tvibox/media";
import { loadLocalEnv, log, serviceClient, supabaseUrl } from "./env";

async function main() {
  loadLocalEnv();
  const sb = serviceClient();
  const base = supabaseUrl();

  for (const [slug, sp] of Object.entries(SCREENPLAYS)) {
    const dur = screenplayDuration(sp);
    if (dur > MAX_EPISODE_SECONDS) throw new Error(`${slug} EP${sp.episode} excede ${MAX_EPISODE_SECONDS}s (${dur}s)`);
  }

  const seriesIds = new Map<string, string>();
  for (const s of SERIES) {
    const sp = SCREENPLAYS[s.slug];
    const { data, error } = await sb
      .from("tvibox_series")
      .upsert(
        {
          slug: s.slug,
          title: s.title,
          genre: s.genre,
          tagline: s.tagline || null,
          synopsis: s.synopsis,
          badge: s.badge ?? null,
          palette: s.palette,
          poster_url: posterPublicUrl(base, s.slug),
          cast_notes: sp?.cast ?? [],
          total_episodes: s.totalEpisodes,
          sort_order: s.sortOrder,
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (error) throw error;
    seriesIds.set(s.slug, data.id);
    log(`série ${s.slug} → ${data.id}`);
  }

  for (const e of EPISODES) {
    const series_id = seriesIds.get(e.series);
    if (!series_id) throw new Error(`Série ${e.series} não semeada`);
    const sp = e.number === 1 ? SCREENPLAYS[e.series] : null;
    const seed = SERIES.find((s) => s.slug === e.series)!;

    const { data: existing } = await sb
      .from("tvibox_episodes")
      .select("id, video_url")
      .eq("series_id", series_id)
      .eq("number", e.number)
      .maybeSingle();

    const row: Record<string, unknown> = {
      series_id,
      number: e.number,
      title: e.title,
      synopsis: e.synopsis,
      hook_title: e.hookTitle,
      hook_text: e.hookText,
      is_free: e.isFree,
      coin_cost: e.coinCost,
      screenplay: sp,
      stats_seed:
        e.number === 1
          ? seed.stats
          : { likes: Math.round(seed.stats.likes * 0.35), comments: Math.round(seed.stats.comments * 0.3) },
    };
    // Só define estado inicial quando ainda não há vídeo publicado.
    if (!existing?.video_url) {
      row.status = e.status === "published" ? "coming_soon" : e.status;
    }
    if (existing) row.id = existing.id;

    const { error } = await sb.from("tvibox_episodes").upsert(row, { onConflict: "series_id,number" });
    if (error) throw error;
    log(`episódio ${e.series} EP${e.number} ${existing ? "atualizado" : "criado"}`);
  }

  log("seed concluído");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
