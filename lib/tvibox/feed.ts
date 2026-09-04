import type { EpisodeRow, FeedItem, SeriesRow } from "./types";

export interface FeedUserState {
  unlocked: Set<string>;
  liked: Set<string>;
  saved: Set<string>;
  likeCounts: Map<string, number>;
  commentCounts: Map<string, number>;
  progress: Map<string, { position: number; completed: boolean }>;
  plusActive: boolean;
}

export const emptyFeedUserState = (): FeedUserState => ({
  unlocked: new Set(),
  liked: new Set(),
  saved: new Set(),
  likeCounts: new Map(),
  commentCounts: new Map(),
  progress: new Map(),
  plusActive: false,
});

/** Após quantos episódios grátis aparece um cartão bloqueado (cliffhanger). */
export const LOCK_EVERY = 3;

/**
 * Constrói o feed "Para Ti" de forma determinística:
 * - episódios grátis publicados por ordem de série;
 * - a cada `LOCK_EVERY` grátis entra o próximo episódio pago de uma série já vista;
 * - `focusId` traz um episódio para o topo (deep link vindo da página da série).
 */
export function buildFeed(
  episodes: EpisodeRow[],
  seriesById: Map<string, SeriesRow>,
  user: FeedUserState,
  focusId?: string | null
): FeedItem[] {
  const order = (e: EpisodeRow) => {
    const s = seriesById.get(e.series_id);
    return [s?.sort_order ?? 999, e.number] as const;
  };
  const visible = episodes
    .filter((e) => seriesById.has(e.series_id) && e.status !== "draft")
    .sort((a, b) => {
      const [sa, na] = order(a);
      const [sb, nb] = order(b);
      return sa - sb || na - nb;
    });

  const free = visible.filter((e) => e.is_free && e.status === "published");

  // Primeiro episódio pago de cada série (o cliffhanger).
  const firstPaidBySeries = new Map<string, EpisodeRow>();
  for (const e of visible) {
    if (e.is_free) continue;
    if (!firstPaidBySeries.has(e.series_id)) firstPaidBySeries.set(e.series_id, e);
  }
  const paidQueue = [...firstPaidBySeries.values()];

  const merged: EpisodeRow[] = [];
  let freeCount = 0;
  for (const e of free) {
    merged.push(e);
    freeCount++;
    if (freeCount % LOCK_EVERY === 0 && paidQueue.length) {
      merged.push(paidQueue.shift() as EpisodeRow);
    }
  }
  merged.push(...paidQueue);

  const toItem = (episode: EpisodeRow): FeedItem => {
    const series = seriesById.get(episode.series_id) as SeriesRow;
    const unlocked = episode.is_free || user.unlocked.has(episode.id);
    const prog = user.progress.get(episode.id);
    return {
      episode,
      series,
      locked: !unlocked,
      pending: unlocked && !episode.video_url,
      liked: user.liked.has(episode.id),
      saved: user.saved.has(series.id),
      likeCount: (episode.stats_seed?.likes ?? 0) + (user.likeCounts.get(episode.id) ?? 0),
      commentCount: (episode.stats_seed?.comments ?? 0) + (user.commentCounts.get(episode.id) ?? 0),
      resumeAt: prog && !prog.completed ? prog.position : 0,
    };
  };

  let items = merged.map(toItem);

  if (focusId) {
    const idx = items.findIndex((i) => i.episode.id === focusId);
    if (idx > 0) {
      const [focus] = items.splice(idx, 1);
      items = [focus, ...items];
    } else if (idx === -1) {
      const ep = visible.find((e) => e.id === focusId);
      if (ep) items = [toItem(ep), ...items];
    }
  }

  return items;
}

/** Percentagem de progresso numa série (episódios concluídos / total anunciado). */
export function seriesProgress(
  series: SeriesRow,
  episodes: EpisodeRow[],
  progress: Map<string, { position: number; completed: boolean }>
): { seen: number; total: number; label: string } {
  const eps = episodes.filter((e) => e.series_id === series.id);
  const seen = eps.filter((e) => progress.get(e.id)?.completed).length;
  const current = Math.min(series.total_episodes, Math.max(1, seen + 1));
  return { seen, total: series.total_episodes, label: `EP ${current}/${series.total_episodes}` };
}
