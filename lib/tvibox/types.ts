/** Tipos partilhados da zona TVI BOX (catálogo, argumento, feed, carteira). */

export type SeriesSlug =
  | "sangue"
  | "patroa"
  | "traicao"
  | "regresso"
  | "verao"
  | "divida"
  | "fogo"
  | "promessa";

export interface CastMember {
  /** Nome da personagem (ator gerado por IA — não corresponde a pessoa real). */
  name: string;
  age: number;
  /** Descrição visual estável, reutilizada em todos os prompts para consistência. */
  look: string;
  role: string;
}

export interface DialogueLine {
  who: string;
  /** Fala em português europeu. */
  text: string;
  /** Direção de representação (em inglês, para o modelo de vídeo). */
  tone?: string;
}

export interface Beat {
  /** Duração em segundos: 8 no plano de abertura, 7 nas extensões (limite do Veo 3.1). */
  dur: 8 | 7;
  /** Descrição visual do plano (em inglês, para o modelo de vídeo). */
  shot: string;
  lines: DialogueLine[];
  /** Desenho de som (em inglês). */
  sfx?: string;
}

export interface Screenplay {
  series: SeriesSlug;
  episode: number;
  title: string;
  logline: string;
  setting: string;
  /** Bíblia visual da série (em inglês) — iluminação, paleta, textura. */
  visualBible: string;
  cast: CastMember[];
  beats: Beat[];
}

export interface SeriesSeed {
  slug: SeriesSlug;
  title: string;
  genre: string;
  tagline: string;
  synopsis: string;
  badge?: "hot" | "new";
  palette: { from: string; to: string };
  totalEpisodes: number;
  sortOrder: number;
  /** Estatísticas fictícias de prova social para o protótipo. */
  stats: { likes: number; comments: number };
}

export interface EpisodeSeed {
  series: SeriesSlug;
  number: number;
  title: string;
  synopsis: string;
  hookTitle: string;
  hookText: string;
  isFree: boolean;
  coinCost: number;
  status: "published" | "coming_soon";
}

/** Linha do catálogo tal como vem da BD (subset usado pela UI). */
export interface SeriesRow {
  id: string;
  slug: string;
  title: string;
  genre: string;
  tagline: string | null;
  synopsis: string | null;
  badge: "hot" | "new" | null;
  palette: { from: string; to: string };
  poster_url: string | null;
  cast_notes: CastMember[];
  total_episodes: number;
  sort_order: number;
}

export interface EpisodeRow {
  id: string;
  series_id: string;
  number: number;
  title: string;
  synopsis: string | null;
  hook_title: string | null;
  hook_text: string | null;
  is_free: boolean;
  coin_cost: number;
  duration_seconds: number | null;
  video_url: string | null;
  poster_url: string | null;
  subtitles_url: string | null;
  render_kind: "none" | "animatic" | "final";
  status: "draft" | "published" | "coming_soon";
  stats_seed: { likes: number; comments: number };
}

export interface FeedItem {
  episode: EpisodeRow;
  series: SeriesRow;
  /** Está atrás do paywall para este utilizador. */
  locked: boolean;
  /** Desbloqueado mas ainda sem vídeo produzido. */
  pending: boolean;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  commentCount: number;
  /** Posição guardada (segundos) para retomar. */
  resumeAt: number;
}

export interface WalletState {
  coins: number;
  streak: number;
  lastCheckin: string | null;
  plusUntil: string | null;
  adsLeft: number;
  settings: { subtitles: boolean; parental: boolean };
}
