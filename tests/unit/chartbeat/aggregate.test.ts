import { describe, expect, it } from "vitest";
import { aggregatePages, attachPrograms, buildSnapshot, isoMinute } from "@lib/chartbeat/aggregate";
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

describe("buildSnapshot", () => {
  it("trunca o instante ao minuto UTC", () => {
    const snap = buildSnapshot([], [], new Date("2026-09-21T12:34:56.789Z"));
    expect(snap.capturedAt).toBe("2026-09-21T12:34:00.000Z");
    expect(isoMinute(new Date("2026-09-21T12:34:01Z"))).toBe("2026-09-21T12:34:00.000Z");
  });
});
