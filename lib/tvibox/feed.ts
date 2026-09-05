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

function toItem(episode: EpisodeRow, series: SeriesRow, user: FeedUserState): FeedItem {
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
}

/** Episódios visíveis de uma série, por número (rascunhos excluídos). */
export function seriesEpisodes(seriesId: string, episodes: EpisodeRow[]): EpisodeRow[] {
  return episodes
    .filter((e) => e.series_id === seriesId && e.status !== "draft")
    .sort((a, b) => a.number - b.number);
}

/**
 * Playlist do player de uma série: EP1 → EP2 → EP3…, cada um com o estado
 * (bloqueado / desbloqueado sem vídeo / pronto) para este utilizador.
 */
export function buildPlaylist(series: SeriesRow, episodes: EpisodeRow[], user: FeedUserState): FeedItem[] {
  return seriesEpisodes(series.id, episodes).map((e) => toItem(e, series, user));
}

/**
 * Episódio por onde abrir o player: o que ficou a meio, senão o primeiro ainda
 * não concluído; se estão todos vistos, o último.
 */
export function resumeEpisode(
  playlist: EpisodeRow[],
  progress: Map<string, { position: number; completed: boolean }>
): EpisodeRow | null {
  if (!playlist.length) return null;
  const inProgress = playlist.find((e) => {
    const p = progress.get(e.id);
    return p && !p.completed && p.position > 1;
  });
  if (inProgress) return inProgress;
  return playlist.find((e) => !progress.get(e.id)?.completed) ?? playlist[playlist.length - 1];
}

export interface Banner {
  series: SeriesRow;
  /** Episódio cujo vídeo serve de pré-visualização (o primeiro com vídeo). */
  cover: EpisodeRow;
  /** Primeiro episódio da série — o banner abre sempre aqui; o player avança por scroll. */
  first: EpisodeRow;
  /** Próximo episódio por ver (usado apenas para o rótulo de progresso). */
  next: EpisodeRow;
  /** Total de episódios já disponíveis (com vídeo ou anunciados). */
  available: number;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  commentCount: number;
  /** Já começou a ver esta série. */
  started: boolean;
  /** Posição guardada no episódio `next` (segundos). */
  resumeAt: number;
  progressLabel: string;
}

/**
 * Feed "Para Ti": um banner por série, estritamente pela ordem editorial
 * (`sort_order`, gerida no Estúdio). Só entram séries com pelo menos um episódio com vídeo.
 */
export function buildBanners(series: SeriesRow[], episodes: EpisodeRow[], user: FeedUserState): Banner[] {
  const banners: Banner[] = [];
  for (const s of [...series].sort((a, b) => a.sort_order - b.sort_order)) {
    const eps = seriesEpisodes(s.id, episodes);
    const cover = eps.find((e) => e.video_url);
    if (!cover) continue;
    const next = resumeEpisode(eps, user.progress) ?? cover;
    const item = toItem(cover, s, user);
    const seen = eps.filter((e) => user.progress.get(e.id)?.completed).length;
    const started = eps.some((e) => user.progress.has(e.id));
    const nextProg = user.progress.get(next.id);
    banners.push({
      series: s,
      cover,
      first: eps[0],
      next,
      available: eps.length,
      liked: item.liked,
      saved: item.saved,
      likeCount: item.likeCount,
      commentCount: item.commentCount,
      started,
      resumeAt: nextProg && !nextProg.completed ? nextProg.position : 0,
      progressLabel: `EP ${Math.min(s.total_episodes, Math.max(1, seen + 1))}/${s.total_episodes}`,
    });
  }
  return banners;
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
