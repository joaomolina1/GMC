import { describe, expect, it } from "vitest";
import {
  buildBanners,
  buildPlaylist,
  emptyFeedUserState,
  resumeEpisode,
  seriesEpisodes,
  seriesProgress,
} from "@lib/tvibox/feed";
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

const S = ["a", "b", "c"].map((id, i) => series(id, i + 1));
const EPS = S.flatMap((s) => [episode(s.id, 1), episode(s.id, 2), episode(s.id, 3, { status: "draft" })]);

describe("buildPlaylist", () => {
  it("devolve os episódios da série por ordem, sem rascunhos, com estado por utilizador", () => {
    const st = emptyFeedUserState();
    st.unlocked.add("a-2");
    const items = buildPlaylist(S[0], EPS, st);
    expect(items.map((i) => i.episode.id)).toEqual(["a-1", "a-2"]);
    expect(items[0]).toMatchObject({ locked: false, pending: false });
    expect(items[1]).toMatchObject({ locked: false, pending: true });
    expect(seriesEpisodes("b", EPS).map((e) => e.number)).toEqual([1, 2]);
  });

  it("bloqueia episódios pagos não desbloqueados", () => {
    const items = buildPlaylist(S[1], EPS, emptyFeedUserState());
    expect(items[1].locked).toBe(true);
  });

  it("soma gostos reais e reflete gostos/guardados/retomar", () => {
    const st = emptyFeedUserState();
    st.liked.add("a-1");
    st.saved.add("a");
    st.likeCounts.set("a-1", 3);
    st.progress.set("a-1", { position: 30, completed: false });
    const [a1] = buildPlaylist(S[0], EPS, st);
    expect(a1).toMatchObject({ liked: true, saved: true, likeCount: 1003, resumeAt: 30 });
  });
});

describe("resumeEpisode", () => {
  const eps = seriesEpisodes("a", EPS);
  it("retoma o episódio a meio", () => {
    const p = new Map([["a-1", { position: 20, completed: false }]]);
    expect(resumeEpisode(eps, p)?.id).toBe("a-1");
  });
  it("avança para o primeiro não concluído", () => {
    const p = new Map([["a-1", { position: 75, completed: true }]]);
    expect(resumeEpisode(eps, p)?.id).toBe("a-2");
  });
  it("com tudo visto fica no último; sem episódios devolve null", () => {
    const p = new Map([
      ["a-1", { position: 75, completed: true }],
      ["a-2", { position: 70, completed: true }],
    ]);
    expect(resumeEpisode(eps, p)?.id).toBe("a-2");
    expect(resumeEpisode([], p)).toBeNull();
  });
});

describe("buildBanners", () => {
  it("um banner por série com vídeo, por ordem editorial", () => {
    const banners = buildBanners(S, EPS, emptyFeedUserState());
    expect(banners.map((b) => b.series.id)).toEqual(["a", "b", "c"]);
    expect(banners[0]).toMatchObject({ cover: { id: "a-1" }, next: { id: "a-1" }, available: 2, started: false });
    expect(banners[0].progressLabel).toBe("EP 1/40");
  });

  it("séries em curso vêm primeiro e apontam para o episódio seguinte", () => {
    const st = emptyFeedUserState();
    st.progress.set("c-1", { position: 75, completed: true });
    const banners = buildBanners(S, EPS, st);
    expect(banners[0].series.id).toBe("c");
    expect(banners[0]).toMatchObject({ next: { id: "c-2" }, started: true, progressLabel: "EP 2/40" });
    expect(banners.slice(1).map((b) => b.series.id)).toEqual(["a", "b"]);
  });

  it("ignora séries sem nenhum episódio com vídeo", () => {
    const eps = EPS.map((e) => (e.series_id === "b" ? { ...e, video_url: null } : e));
    expect(buildBanners(S, eps, emptyFeedUserState()).map((b) => b.series.id)).toEqual(["a", "c"]);
  });
});

describe("seriesProgress", () => {
  it("conta episódios concluídos e aponta o próximo", () => {
    const progress = new Map([["a-1", { position: 75, completed: true }]]);
    expect(seriesProgress(S[0], EPS, progress)).toEqual({ seen: 1, total: 40, label: "EP 2/40" });
    expect(seriesProgress(S[1], EPS, progress).label).toBe("EP 1/40");
  });
});
