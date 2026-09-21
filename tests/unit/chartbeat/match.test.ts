import { describe, expect, it } from "vitest";
import {
  looksLikeLive,
  matchAppLabel,
  matchPage,
  matchWebPath,
  parsePageLocation,
} from "@lib/chartbeat/match";
import type { ChartbeatPage } from "@lib/chartbeat/types";

const page = (partial: Partial<ChartbeatPage> & Pick<ChartbeatPage, "path">): ChartbeatPage => ({
  host: "tviplayer.iol.pt",
  title: "",
  people: 1,
  ...partial,
});

describe("parsePageLocation", () => {
  it("normaliza URL web com host no path e casing", () => {
    expect(parsePageLocation(page({ path: "tviplayer.iol.pt/direto/TVI" }))).toEqual({
      host: "tviplayer.iol.pt",
      pathname: "/direto/tvi",
      kind: "web",
    });
  });
  it("trata o player da CNN no próprio domínio, com e sem slash", () => {
    expect(parsePageLocation(page({ host: "cnnportugal.iol.pt", path: "cnnportugal.iol.pt/direto" })).pathname).toBe(
      "/direto"
    );
    expect(parsePageLocation(page({ host: "cnnportugal.iol.pt", path: "cnnportugal.iol.pt/direto/" })).pathname).toBe(
      "/direto"
    );
  });
  it("classifica títulos da app nativa (sem URL)", () => {
    expect(parsePageLocation(page({ path: "Direto - TVI" })).kind).toBe("app");
    expect(parsePageLocation(page({ path: "Direto - CNN Portugal" })).kind).toBe("app");
  });
});

describe("matchWebPath", () => {
  it("agrega aliases TVI e não mistura CNN/Reality", () => {
    expect(matchWebPath("tviplayer.iol.pt", "/direto")).toBe("tvi");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/tvi")).toBe("tvi");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/cnn")).toBe("cnn");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/tvireality")).toBe("tvi-reality");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/tvificcao")).toBe("tvi-ficcao");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/tviinternacional")).toBe("tvi-internacional");
    expect(matchWebPath("tviplayer.iol.pt", "/direto/vmais")).toBe("vmais-tvi");
  });
  it("CNN no domínio próprio; /direto/videos fica de fora", () => {
    expect(matchWebPath("cnnportugal.iol.pt", "/direto")).toBe("cnn");
    expect(matchWebPath("cnnportugal.iol.pt", "/direto/videos")).toBeNull();
  });
});

describe("matchAppLabel", () => {
  it("reconhece os títulos da app IOL", () => {
    expect(matchAppLabel("Direto - TVI")).toBe("tvi");
    expect(matchAppLabel("Direto - TVI Reality")).toBe("tvi-reality");
    expect(matchAppLabel("Direto - CNN Portugal")).toBe("cnn");
    expect(matchAppLabel("Direto - TVI Ficção")).toBe("tvi-ficcao");
    expect(matchAppLabel("Direto - TVI Internacional")).toBe("tvi-internacional");
    expect(matchAppLabel("Direto - V+ TVI")).toBe("vmais-tvi");
  });
  it("não classifica TVI Reality como TVI", () => {
    expect(matchAppLabel("Direto - TVI Reality")).not.toBe("tvi");
  });
});

describe("matchPage", () => {
  it("mapeia as linhas reais do dashboard tviplayer", () => {
    const rows: [string, string, string][] = [
      ["tviplayer.iol.pt/direto", "Direto TVI | TVI Player", "tvi"],
      ["tviplayer.iol.pt/direto/tvi", "Direto TVI | TVI Player", "tvi"],
      ["tviplayer.iol.pt/direto/TVI", "Direto TVI | TVI Player", "tvi"],
      ["Direto - TVI", "Direto - TVI", "tvi"],
      ["tviplayer.iol.pt/direto/cnn", "Direto CNN Portugal | TVI Player", "cnn"],
      ["tviplayer.iol.pt/direto/CNN", "Direto CNN Portugal | TVI Player", "cnn"],
      ["Direto - CNN Portugal", "Direto - CNN Portugal", "cnn"],
      ["tviplayer.iol.pt/direto/tvireality", "Direto TVI Reality | TVI Player", "tvi-reality"],
      ["Direto - TVI Reality", "Direto - TVI Reality", "tvi-reality"],
      ["tviplayer.iol.pt/direto/tviinternacional", "Direto TVI Internacional | TVI Player", "tvi-internacional"],
      ["Direto - TVI Ficção", "Direto - TVI Ficção", "tvi-ficcao"],
      ["Direto - V+ TVI", "Direto - V+ TVI", "vmais-tvi"],
    ];
    for (const [path, title, slug] of rows) {
      const m = matchPage(page({ path, title, people: 10 }));
      expect(m?.channelSlug, path).toBe(slug);
    }
  });
  it("CNN no domínio cnnportugal.iol.pt", () => {
    expect(
      matchPage(
        page({
          host: "cnnportugal.iol.pt",
          path: "cnnportugal.iol.pt/direto",
          title: "CNN  Direto",
          people: 789,
        })
      )?.channelSlug
    ).toBe("cnn");
  });
  it("não classifica VOD / gala / homepage como direto", () => {
    expect(
      matchPage(
        page({
          path: "tviplayer.iol.pt/programa/big-brother/5eb3f47e0cf2a58834209072/video/abc",
          title: "Big Brother All Stars - Gala",
          people: 1113,
        })
      )
    ).toBeNull();
    expect(matchPage(page({ host: "cnnportugal.iol.pt", path: "cnnportugal.iol.pt/", title: "Homepage" }))).toBeNull();
  });
});

describe("looksLikeLive", () => {
  it("flagga /direto/videos para a lista de unmatched, não para um canal", () => {
    const p = page({
      host: "cnnportugal.iol.pt",
      path: "cnnportugal.iol.pt/direto/videos",
      title: "Videos",
      people: 5,
    });
    expect(matchPage(p)).toBeNull();
    expect(looksLikeLive(p)).toBe(true);
  });
});
