/** Tipos da zona Chartbeat · Diretos (páginas live + histórico ao minuto). */

export type ChartbeatHost = "tviplayer.iol.pt" | "cnnportugal.iol.pt";

export type SourceKind = "web" | "app";

export interface ChartbeatPage {
  host: string;
  path: string;
  title: string;
  people: number;
  platform?: {
    m?: number;
    d?: number;
    t?: number;
    a?: number;
  };
  /** Concorrentes por origem (já vêm no toppages; não são um segundo contador). */
  direct?: number;
  search?: number;
  social?: number;
  internal?: number;
  links?: number;
  /** Média de engaged time desta página, em segundos. */
  engagedAvg?: number | null;
  loyalty?: {
    new?: number;
    returning?: number;
    loyal?: number;
  };
}

export interface ChartbeatVideo {
  path: string;
  title: string;
  watching: number;
  visitors: number;
  thumbnail?: string;
}

export interface ChannelDef {
  slug: string;
  name: string;
  color: string;
  sortOrder: number;
  /** IDs Chartbeat Video Engagement do linear (título = programa no ar). */
  videoIds: string[];
  /** Host do player cujo `video_state` representa este linear. */
  videoHost?: ChartbeatHost;
}

/** Composição de um canal num minuto. Contagens somam-se entre paths; o engagement é média pesada. */
export interface ChannelMix {
  direct: number;
  search: number;
  social: number;
  internal: number;
  links: number;
  new: number;
  returning: number;
  loyal: number;
  mobile: number;
  desktop: number;
  tablet: number;
  engagedSec: number | null;
  playing: number | null;
  paused: number | null;
  unplayed: number | null;
}

/** Estado do player: [por começar, a reproduzir, em pausa, concluído]. */
export interface VideoPlayback {
  unplayed: number;
  playing: number;
  paused: number;
  completed: number;
}

export interface MatchedSource {
  channelSlug: string;
  host: string;
  path: string;
  title: string;
  people: number;
  kind: SourceKind;
  /** Pathname web normalizado (ex.: `/direto/tvi`) ou título da app. */
  pathname: string;
}

export interface UnmatchedLive {
  host: string;
  path: string;
  title: string;
  people: number;
}

export interface ChannelMinute {
  slug: string;
  people: number;
  web: number;
  app: number;
  sources: MatchedSource[];
  programTitle: string | null;
  videoWatching: number | null;
  /** null em minutos gravados antes da composição existir. */
  mix: ChannelMix | null;
}

export interface Snapshot {
  capturedAt: string;
  channels: ChannelMinute[];
  unmatched: UnmatchedLive[];
  pageCount: number;
  matchedCount: number;
}

export type HistoryRange = "6h" | "24h" | "7d" | "30d";

/** Granularidade da série: minuto (ideal) ou médias em hora/dia de Lisboa. */
export type HistoryGrain = "minute" | "hour" | "day";

export interface HistoryPoint {
  bucket: string;
  people: Record<string, number>;
  mix?: Record<string, ChannelMix>;
}

export interface HistoryPayload {
  range: HistoryRange;
  grain: HistoryGrain;
  from: string;
  points: HistoryPoint[];
}
