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
}

export interface HistoryPayload {
  range: HistoryRange;
  grain: HistoryGrain;
  from: string;
  points: HistoryPoint[];
}
