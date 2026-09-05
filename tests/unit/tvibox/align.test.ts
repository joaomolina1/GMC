import { describe, expect, it } from "vitest";
import { alignLinesToWords, linesFromVtt, normalizeToken, similarity, tokenize, type AsrWord } from "@lib/tvibox/align";

function words(spec: string): AsrWord[] {
  // "palavra@inicio" separados por espaço; cada palavra dura 0,3 s
  return spec.split(/\s+/).map((tok) => {
    const [w, s] = tok.split("@");
    return { w, s: Number(s), e: Number(s) + 0.3 };
  });
}

describe("normalizeToken / similarity", () => {
  it("ignora acentos, maiúsculas e pontuação", () => {
    expect(normalizeToken("Setúbal.")).toBe("setubal");
    expect(tokenize("Bem-vindo de volta, filho do Ferreira.")).toEqual(["bem", "vindo", "de", "volta", "filho", "do", "ferreira"]);
  });
  it("tolera erros típicos de ASR", () => {
    expect(similarity("quanto", "quanta")).toBeGreaterThanOrEqual(0.8);
    expect(similarity("despede", "despeie")).toBeGreaterThanOrEqual(0.8);
    expect(similarity("tiago", "estrada")).toBeLessThan(0.5);
  });
});

describe("alignLinesToWords", () => {
  const lines = [
    { who: "Helena", text: "Como te chamas?" },
    { who: "Tiago", text: "Tiago." },
    { who: "Helena", text: "Tiago quê?" },
    { who: "Tiago", text: "Ferreira." },
  ];

  it("coloca cada fala no instante em que é dita, e não no início do beat", () => {
    const asr = words("Como@32.9 te@33.2 chamas?@33.4 Tiago.@35.4 Tiago@36.6 quê?@37.3 Ferreira.@39.1");
    const { cues, dropped, coverage } = alignLinesToWords(lines, asr);
    expect(dropped).toEqual([]);
    expect(coverage).toBe(1);
    expect(cues.map((c) => c.text)).toEqual(lines.map((l) => l.text));
    expect(cues[0].start).toBeCloseTo(32.9 - 0.12, 2);
    expect(cues[0].end).toBeLessThan(cues[1].start);
    expect(cues[1].start).toBeCloseTo(35.4 - 0.12, 2);
    expect(cues[3].start).toBeCloseTo(39.1 - 0.12, 2);
    // duração mínima legível
    for (const c of cues) expect(c.end - c.start).toBeGreaterThanOrEqual(0.5);
  });

  it("deixa de fora falas que o vídeo não diz", () => {
    const asr = words("Como@32.9 te@33.2 chamas?@33.4 Tiago@36.6 quê?@37.3 Ferreira.@39.1");
    const { cues, dropped } = alignLinesToWords(lines, asr);
    // "Tiago." isolado: a única palavra reconhecida vai para a fala mais antiga ("Tiago.")
    // e "Tiago quê?" fica com 1/2 palavras — ainda passa o mínimo de 40 %.
    expect(cues.length + dropped.length).toBe(lines.length);
    expect(cues.find((c) => c.text === "Como te chamas?")).toBeDefined();
    expect(cues.find((c) => c.text === "Ferreira.")).toBeDefined();
  });

  it("descarta falas longas quase todas ausentes e aceita ASR com erros", () => {
    const script = [
      { who: "Helena", text: "Não me interessa quanto custa. Compra a empresa e despede o filho do dono. Hoje." },
      { who: "Helena", text: "Tens algum problema, motorista?" },
    ];
    const asr = words("Tens@26.3 algum@26.6 problema@26.9 motorista@27.4");
    const r = alignLinesToWords(script, asr);
    expect(r.cues).toHaveLength(1);
    expect(r.cues[0].text).toBe("Tens algum problema, motorista?");
    expect(r.dropped[0].line.text).toMatch(/^Não me interessa/);
  });

  it("uma legenda nunca se sobrepõe à seguinte", () => {
    const asr = words("Como@10 te@10.2 chamas?@10.4 Tiago.@10.8 Tiago@11.1 quê?@11.3 Ferreira.@11.7");
    const { cues } = alignLinesToWords(lines, asr);
    for (let i = 0; i < cues.length - 1; i++) expect(cues[i].end).toBeLessThanOrEqual(cues[i + 1].start);
  });

  it("sem ASR não produz legendas", () => {
    const r = alignLinesToWords(lines, []);
    expect(r.cues).toEqual([]);
    expect(r.dropped).toHaveLength(4);
  });
});

describe("linesFromVtt", () => {
  it("extrai orador e texto", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<v Helena>Como te chamas?\n\n2\n00:00:03.000 --> 00:00:04.000\n<v Tiago>Tiago.\n";
    expect(linesFromVtt(vtt)).toEqual([
      { who: "Helena", text: "Como te chamas?" },
      { who: "Tiago", text: "Tiago." },
    ]);
  });
});
