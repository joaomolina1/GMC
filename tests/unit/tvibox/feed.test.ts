import { describe, expect, it } from "vitest";
import { LOCK_EVERY, buildFeed, emptyFeedUserState, seriesProgress } from "@lib/tvibox/feed";
import type { EpisodeRow, SeriesRow } from "@lib/tvibox/types";

function series(id: string, sort: number): SeriesRow {
  return {
    id,
    slug: id,
    title: id.toUpperCase(),
    genre: "Drama",
    tagline: null,
    synopsis: null,
    badge: null,
    palette: { from: "#000", to: "#111" },
    poster_url: null,
    cast_notes: [],
    total_episodes: 40,
    sort_order: sort,
  };
}

function episode(series_id: string, number: number, over: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: `${series_id}-${number}`,
    series_id,
    number,
    title: `EP ${number}`,
    synopsis: null,
    hook_title: null,
    hook_text: null,
    is_free: number === 1,
    coin_cost: number === 1 ? 0 : 15,
    duration_seconds: 75,
    video_url: number === 1 ? "https://cdn/ep1.mp4" : null,
    poster_url: null,
    subtitles_url: null,
    render_kind: number === 1 ? "animatic" : "none",
    status: number === 1 ? "published" : "coming_soon",
    stats_seed: { likes: 1000, comments: 10 },
    ...over,
  };
}

const S = ["a", "b", "c", "d", "e"].map((id, i) => series(id, i + 1));
const byId = new Map(S.map((s) => [s.id, s]));
const EPS = S.flatMap((s) => [episode(s.id, 1), episode(s.id, 2)]);

describe("buildFeed", () => {
  it("intercala um cliffhanger bloqueado a cada LOCK_EVERY episódios grátis", () => {
    const items = buildFeed(EPS, byId, emptyFeedUserState());
    const ids = items.map((i) => i.episode.id);
    expect(ids.slice(0, LOCK_EVERY + 1)).toEqual(["a-1", "b-1", "c-1", "a-2"]);
    expect(items[LOCK_EVERY].locked).toBe(true);
    expect(items.filter((i) => !i.locked)).toHaveLength(5);
    expect(items).toHaveLength(10);
  });

  it("respeita desbloqueios e marca pendente quando não há vídeo", () => {
    const st = emptyFeedUserState();
    st.unlocked.add("a-2");
    const items = buildFeed(EPS, byId, st);
    const a2 = items.find((i) => i.episode.id === "a-2")!;
    expect(a2.locked).toBe(false);
    expect(a2.pending).toBe(true);
  });

  it("soma likes reais às estatísticas de arranque e reflete gostos/guardados", () => {
    const st = emptyFeedUserState();
    st.liked.add("b-1");
    st.saved.add("b");
    st.likeCounts.set("b-1", 3);
    st.progress.set("b-1", { position: 30, completed: false });
    const b1 = buildFeed(EPS, byId, st).find((i) => i.episode.id === "b-1")!;
    expect(b1).toMatchObject({ liked: true, saved: true, likeCount: 1003, resumeAt: 30 });
  });

  it("focusId traz o episódio para o topo", () => {
    const items = buildFeed(EPS, byId, emptyFeedUserState(), "d-1");
    expect(items[0].episode.id).toBe("d-1");
    expect(items.filter((i) => i.episode.id === "d-1")).toHaveLength(1);
  });

  it("ignora rascunhos e séries desconhecidas", () => {
    const eps = [...EPS, episode("a", 3, { status: "draft" }), episode("zzz", 1)];
    const items = buildFeed(eps, byId, emptyFeedUserState());
    expect(items.some((i) => i.episode.id === "a-3")).toBe(false);
    expect(items.some((i) => i.episode.id === "zzz-1")).toBe(false);
  });
});

describe("seriesProgress", () => {
  it("conta episódios concluídos e aponta o próximo", () => {
    const progress = new Map([["a-1", { position: 75, completed: true }]]);
    expect(seriesProgress(S[0], EPS, progress)).toEqual({ seen: 1, total: 40, label: "EP 2/40" });
    expect(seriesProgress(S[1], EPS, progress).label).toBe("EP 1/40");
  });
});
