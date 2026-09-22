import { describe, expect, it } from "vitest";
import { aggregatePages, attachPlayback, attachPrograms, buildSnapshot, isoMinute } from "@lib/chartbeat/aggregate";
import { mixFromDb, mixToDb, playbackFromEnum } from "@lib/chartbeat/mix";
import type { ChartbeatPage, ChartbeatVideo } from "@lib/chartbeat/types";

const P = (host: string, path: string, title: string, people: number): ChartbeatPage => ({
  host,
  path,
  title,
  people,
});

describe("aggregatePages", () => {
  it("soma os vários links TVI Player + app no mesmo canal TVI", () => {
    const pages: ChartbeatPage[] = [
      P("tviplayer.iol.pt", "tviplayer.iol.pt/direto", "Direto TVI | TVI Player", 854),
      P("tviplayer.iol.pt", "tviplayer.iol.pt/direto/tvi", "Direto TVI | TVI Player", 387),
      P("tviplayer.iol.pt", "Direto - TVI", "Direto - TVI", 384),
      P("tviplayer.iol.pt", "tviplayer.iol.pt/direto/TVI", "Direto TVI | TVI Player", 207),
      P("tviplayer.iol.pt", "tviplayer.iol.pt/programa/big-brother/x", "Big Brother All Stars - Gala", 1113),
    ];
    const { channels } = aggregatePages(pages);
    const tvi = channels.find((c) => c.slug === "tvi")!;
    expect(tvi.people).toBe(854 + 387 + 384 + 207);
    expect(tvi.web).toBe(854 + 387 + 207);
    expect(tvi.app).toBe(384);
    expect(tvi.sources).toHaveLength(4);
  });

  it("soma CNN no TVI Player e no domínio cnnportugal.iol.pt", () => {
    const pages: ChartbeatPage[] = [
      P("tviplayer.iol.pt", "tviplayer.iol.pt/direto/cnn", "Direto CNN Portugal | TVI Player", 121),
      P("tviplayer.iol.pt", "tviplayer.iol.pt/direto/CNN", "Direto CNN Portugal | TVI Player", 20),
      P("tviplayer.iol.pt", "Direto - CNN Portugal", "Direto - CNN Portugal", 69),
      P("cnnportugal.iol.pt", "cnnportugal.iol.pt/direto", "CNN  Direto", 789),
      P("cnnportugal.iol.pt", "cnnportugal.iol.pt/direto/", "CNN", 46),
      P("cnnportugal.iol.pt", "cnnportugal.iol.pt/direto/videos", "Videos", 5),
    ];
    const { channels, unmatched } = aggregatePages(pages);
    const cnn = channels.find((c) => c.slug === "cnn")!;
    expect(cnn.people).toBe(121 + 20 + 69 + 789 + 46);
    expect(unmatched.some((u) => u.path.includes("/direto/videos"))).toBe(true);
  });

  it("mantém canais a zero quando não há páginas", () => {
    const { channels } = aggregatePages([]);
    expect(channels.map((c) => c.slug)).toEqual([
      "tvi",
      "cnn",
      "tvi-reality",
      "tvi-ficcao",
      "tvi-internacional",
      "vmais-tvi",
    ]);
    expect(channels.every((c) => c.people === 0)).toBe(true);
  });
});

describe("attachPrograms", () => {
  it("usa o video id estável, não o VOD", () => {
    const videos: ChartbeatVideo[] = [
      { path: "554a58200cf203057812d86b", title: "Dois às 10", watching: 969, visitors: 1069 },
      { path: "618427ce0cf2648aa1626c36", title: "CNN Meio Dia", watching: 606, visitors: 644 },
      { path: "streaming-vod1.iol.pt/foo", title: "clip", watching: 1, visitors: 1 },
    ];
    const { channels } = aggregatePages([]);
    const withProg = attachPrograms(channels, videos);
    expect(withProg.find((c) => c.slug === "tvi")?.programTitle).toBe("Dois às 10");
    expect(withProg.find((c) => c.slug === "cnn")?.programTitle).toBe("CNN Meio Dia");
    expect(withProg.find((c) => c.slug === "cnn")?.videoWatching).toBe(606);
  });
});

describe("composição do canal", () => {
  it("soma origem e ecrã e pesa o engagement pelo número de pessoas", () => {
    const pages: ChartbeatPage[] = [
      {
        ...P("tviplayer.iol.pt", "tviplayer.iol.pt/direto", "Direto", 100),
        search: 40,
        social: 60,
        platform: { m: 80, d: 20 },
        loyalty: { new: 10, returning: 20, loyal: 70 },
        engagedAvg: 10,
      },
      {
        ...P("tviplayer.iol.pt", "tviplayer.iol.pt/direto/tvi", "Direto", 300),
        search: 10,
        internal: 290,
        platform: { d: 300 },
        loyalty: { new: 30, returning: 70, loyal: 200 },
        engagedAvg: 50,
      },
    ];
    const tvi = aggregatePages(pages).channels.find((c) => c.slug === "tvi")!;
    expect(tvi.mix).toMatchObject({
      search: 50,
      social: 60,
      internal: 290,
      mobile: 80,
      desktop: 320,
      new: 40,
      returning: 90,
      loyal: 270,
      engagedSec: 40,
      playing: null,
    });
  });

  it("grava o estado do player sem o misturar com as pessoas da página", () => {
    const { channels } = aggregatePages([]);
    const withPlayer = attachPlayback(channels, {
      tvi: { unplayed: 9, playing: 80, paused: 4, completed: 0 },
    });
    expect(withPlayer.find((c) => c.slug === "tvi")?.mix?.playing).toBe(80);
    expect(withPlayer.find((c) => c.slug === "tvi")?.people).toBe(0);
    expect(playbackFromEnum([9, 80, 4, 0])?.paused).toBe(4);
    expect(playbackFromEnum([1, 2])).toBeNull();
    const stored = mixToDb(withPlayer.find((c) => c.slug === "tvi")!.mix!);
    expect(mixFromDb(stored)?.playing).toBe(80);
    expect(mixFromDb({})).toBeNull();
  });
});

describe("buildSnapshot", () => {
  it("trunca o instante ao minuto UTC", () => {
    const snap = buildSnapshot([], [], new Date("2026-09-21T12:34:56.789Z"));
    expect(snap.capturedAt).toBe("2026-09-21T12:34:00.000Z");
    expect(isoMinute(new Date("2026-09-21T12:34:01Z"))).toBe("2026-09-21T12:34:00.000Z");
  });
});
