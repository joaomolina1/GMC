import { createClient } from "@lib/supabase/server";
import { buildFeed, emptyFeedUserState, type FeedUserState } from "./feed";
import { adsLeftToday, isPlusActive, toDateKey } from "./economy";
import type { EpisodeRow, FeedItem, SeriesRow, WalletState } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface TviboxViewer {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  memberSince: string;
  isAdmin: boolean;
}

const EPISODE_COLUMNS =
  "id, series_id, number, title, synopsis, hook_title, hook_text, is_free, coin_cost, duration_seconds, video_url, poster_url, subtitles_url, render_kind, status, stats_seed";

const SERIES_COLUMNS =
  "id, slug, title, genre, tagline, synopsis, badge, palette, poster_url, cast_notes, total_episodes, sort_order";

export function initialsOf(name: string, email: string): string {
  const src = (name || email.split("@")[0] || "?").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export async function getViewer(supabase?: Supabase): Promise<TviboxViewer | null> {
  const sb = supabase ?? (await createClient());
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? "";
  const fullName = profile?.full_name ?? "";
  return {
    id: user.id,
    email,
    fullName,
    initials: initialsOf(fullName, email),
    memberSince: profile?.created_at ?? user.created_at,
    isAdmin: profile?.role === "admin" || profile?.role === "super_admin",
  };
}

interface WalletRow {
  coins: number;
  streak: number;
  last_checkin: string | null;
  plus_until: string | null;
  ads_today: number;
  ads_day: string | null;
  settings: { subtitles?: boolean; parental?: boolean } | null;
}

export function toWalletState(row: WalletRow | null): WalletState {
  const today = toDateKey(new Date());
  return {
    coins: row?.coins ?? 0,
    streak: row?.streak ?? 0,
    lastCheckin: row?.last_checkin ?? null,
    plusUntil: row?.plus_until ?? null,
    adsLeft: adsLeftToday(row?.ads_today ?? 0, row?.ads_day ?? null, today),
    settings: {
      subtitles: row?.settings?.subtitles ?? true,
      parental: row?.settings?.parental ?? false,
    },
  };
}

export async function getWallet(supabase?: Supabase): Promise<WalletState> {
  const sb = supabase ?? (await createClient());
  const { data, error } = await sb.rpc("tvibox_ensure_wallet");
  if (error) {
    console.error("[tvibox] ensure_wallet", error.message);
    return toWalletState(null);
  }
  return toWalletState(data as WalletRow);
}

export async function getCatalog(
  supabase?: Supabase
): Promise<{ series: SeriesRow[]; episodes: EpisodeRow[]; seriesById: Map<string, SeriesRow> }> {
  const sb = supabase ?? (await createClient());
  const [{ data: series }, { data: episodes }] = await Promise.all([
    sb.from("tvibox_series").select(SERIES_COLUMNS).order("sort_order"),
    sb.from("tvibox_episodes").select(EPISODE_COLUMNS).order("number"),
  ]);
  const s = (series ?? []) as unknown as SeriesRow[];
  const e = (episodes ?? []) as unknown as EpisodeRow[];
  return { series: s, episodes: e, seriesById: new Map(s.map((x) => [x.id, x])) };
}

export async function getUserFeedState(
  userId: string,
  episodeIds: string[],
  supabase?: Supabase
): Promise<FeedUserState> {
  const sb = supabase ?? (await createClient());
  const state = emptyFeedUserState();

  const [unlocks, likes, list, progress, counts, wallet] = await Promise.all([
    sb.from("tvibox_unlocks").select("episode_id").eq("user_id", userId),
    sb.from("tvibox_likes").select("episode_id").eq("user_id", userId),
    sb.from("tvibox_list").select("series_id").eq("user_id", userId),
    sb.from("tvibox_progress").select("episode_id, position_seconds, completed").eq("user_id", userId),
    episodeIds.length ? sb.rpc("tvibox_episode_counts", { p_ids: episodeIds }) : Promise.resolve({ data: [] }),
    sb.from("tvibox_wallets").select("plus_until").eq("user_id", userId).maybeSingle(),
  ]);

  for (const u of unlocks.data ?? []) state.unlocked.add(u.episode_id);
  for (const l of likes.data ?? []) state.liked.add(l.episode_id);
  for (const l of list.data ?? []) state.saved.add(l.series_id);
  for (const p of progress.data ?? [])
    state.progress.set(p.episode_id, { position: Number(p.position_seconds), completed: !!p.completed });
  for (const c of (counts.data ?? []) as { episode_id: string; likes: number; comments: number }[]) {
    state.likeCounts.set(c.episode_id, Number(c.likes));
    state.commentCounts.set(c.episode_id, Number(c.comments));
  }
  state.plusActive = isPlusActive(wallet.data?.plus_until ?? null);
  return state;
}

export async function getFeed(
  userId: string,
  focusId?: string | null
): Promise<{ items: FeedItem[]; series: SeriesRow[] }> {
  const sb = await createClient();
  const { series, episodes, seriesById } = await getCatalog(sb);
  const user = await getUserFeedState(
    userId,
    episodes.map((e) => e.id),
    sb
  );
  return { items: buildFeed(episodes, seriesById, user, focusId), series };
}

export async function getTransactions(userId: string, limit = 12) {
  const sb = await createClient();
  const { data } = await sb
    .from("tvibox_transactions")
    .select("id, delta, reason, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; delta: number; reason: string; metadata: Record<string, unknown>; created_at: string }[];
}
