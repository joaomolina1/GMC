import { describe, expect, it } from "vitest";
import {
  detectEpisodeNumber,
  extractJson,
  pickEpisodeFiles,
  segmentsToCues,
  seriesTitleFromFilenames,
  slugify,
  type SourceFile,
} from "@lib/tvibox/import";
import { cuesToVtt } from "@lib/tvibox/subtitles";

const TVI = (n: number, extra = "") => `Barcelos/PG26000415${String(n).padStart(3, "0")}FH01_QUEM MATOU O GALO DE BARCELOS  9 16 TVIPLAYER_T1_E${String(n).padStart(3, "0")}.leve${extra}.mp4`;

describe("detectEpisodeNumber", () => {
  it("lê os formatos habituais de nomes de ficheiro", () => {
    expect(detectEpisodeNumber(TVI(7))).toBe(7);
    expect(detectEpisodeNumber(TVI(31, ".2"))).toBe(31);
    expect(detectEpisodeNumber("EP12 - A chamada.mp4")).toBe(12);
    expect(detectEpisodeNumber("novela_ep-3.mov")).toBe(3);
    expect(detectEpisodeNumber("Episódio 07.mp4")).toBe(7);
    expect(detectEpisodeNumber("04.mp4")).toBe(4);
    expect(detectEpisodeNumber("Quem matou o galo 15.mp4")).toBe(15);
    expect(detectEpisodeNumber("genérico.mp4")).toBeNull();
  });
});

describe("pickEpisodeFiles", () => {
  const f = (name: string, durationSeconds: number | null, sizeBytes = 1000): SourceFile => ({ name, durationSeconds, sizeBytes });

  it("ordena, escolhe o duplicado legível mais longo e avisa de buracos", () => {
    const { episodes, warnings } = pickEpisodeFiles([
      f(TVI(2), 79),
      f(TVI(1), 98),
      f(TVI(31), null, 6_000_000),
      f(TVI(31, ".2"), 52, 8_000_000),
      f(TVI(33), 70),
      f("__MACOSX/._x.mp4", 10),
      f("Barcelos/notas.txt", null),
    ]);
    expect(episodes.map((e) => e.number)).toEqual([1, 2, 31, 33]);
    expect(episodes[2].file.name).toBe(TVI(31, ".2"));
    expect(warnings.some((w) => w.startsWith("EP 31") && w.includes("corrompido"))).toBe(true);
    expect(warnings.some((w) => w.includes("entre EP 2 e EP 31"))).toBe(true);
    expect(warnings.some((w) => w.includes("entre EP 31 e EP 33"))).toBe(true);
  });

  it("ignora episódios sem nenhum ficheiro legível", () => {
    const { episodes, warnings } = pickEpisodeFiles([f(TVI(1), 98), f(TVI(2), null)]);
    expect(episodes.map((e) => e.number)).toEqual([1]);
    expect(warnings[0]).toMatch(/EP 2: nenhum ficheiro legível/);
  });
});

describe("seriesTitleFromFilenames / slugify", () => {
  it("extrai o título comum limpo dos códigos técnicos", () => {
    expect(seriesTitleFromFilenames([TVI(1), TVI(2), TVI(55)])).toBe("Quem Matou o Galo de Barcelos");
    expect(slugify("Quem Matou o Galo de Barcelos")).toBe("quem-matou-o-galo-de-barcelos");
  });
  it("devolve null quando não há texto comum", () => {
    expect(seriesTitleFromFilenames(["01.mp4", "02.mp4"])).toBeNull();
  });
});

describe("segmentsToCues", () => {
  it("mantém segmentos curtos e parte os longos na pontuação, sem sobreposição", () => {
    const cues = segmentsToCues([
      { start: 1.0, end: 4.0, text: "  Mas quem?  " },
      {
        start: 5.0,
        end: 13.0,
        text: "Rodrigo Barcelos, o filho mais velho, empresário bem sucedido, e a sua esposa, a simplória e tonta Matilde.",
      },
    ]);
    expect(cues[0]).toEqual({ start: 1, end: 4, who: "", text: "Mas quem?" });
    expect(cues.length).toBeGreaterThanOrEqual(3);
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(84);
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i].end).toBeLessThanOrEqual(cues[i + 1].start);
    expect(cues[cues.length - 1].end).toBeCloseTo(13, 5);
  });

  it("gera WebVTT sem etiqueta de orador quando não há quem fala", () => {
    const vtt = cuesToVtt(segmentsToCues([{ start: 0, end: 2, text: "Olá." }]));
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.000\nOlá.");
    expect(vtt).not.toContain("<v ");
  });
});

describe("extractJson", () => {
  it("tolera cercas e texto à volta", () => {
    expect(extractJson('Aqui está:\n```json\n{"a":1}\n```\nobrigado')).toEqual({ a: 1 });
    expect(extractJson('{"b":[1,2]} trailing')).toEqual({ b: [1, 2] });
    expect(() => extractJson("nada")).toThrow();
  });
});
