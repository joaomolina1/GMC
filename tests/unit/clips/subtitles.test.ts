import { describe, expect, it } from "vitest";
import { buildSrt, buildSubtitleCues, formatSrtTimestamp, wrapCueText } from "@lib/clips/subtitles";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";

const segments = syntheticTranscript({ sentenceCount: 20, sentenceSec: 4, gapSec: 0.4 });

describe("formatSrtTimestamp", () => {
  it("formata HH:MM:SS,mmm", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(65.25)).toBe("00:01:05,250");
    expect(formatSrtTimestamp(3661.999)).toBe("01:01:01,999");
    expect(formatSrtTimestamp(-3)).toBe("00:00:00,000");
  });
});

describe("wrapCueText", () => {
  it("não quebra texto curto", () => {
    expect(wrapCueText("Olá mundo", 42)).toBe("Olá mundo");
  });
  it("quebra em duas linhas equilibradas", () => {
    const out = wrapCueText("uma frase suficientemente longa para precisar de quebra de linha", 30);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThan(12);
  });
});

describe("buildSubtitleCues", () => {
  it("recorta ao intervalo e rebaseia a zero", () => {
    // Frase 2 = 8.8–12.8, frase 3 = 13.2–17.2. Clip 8.8 → 17.2.
    const cues = buildSubtitleCues(segments, { inSec: 8.8, outSec: 17.2 });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].startSec).toBeCloseTo(0, 3);
    for (const c of cues) {
      expect(c.startSec).toBeGreaterThanOrEqual(0);
      expect(c.endSec).toBeLessThanOrEqual(17.2 - 8.8 + 1e-6);
      expect(c.endSec).toBeGreaterThan(c.startSec);
    }
    const flat = cues.map((c) => c.text.replace(/\n/g, " ")).join(" ");
    expect(flat).toContain("frase número 3");
    expect(flat).toContain("frase número 4");
    expect(flat).not.toContain("frase número 2 ");
  });

  it("corta palavras fora do intervalo quando o clip começa a meio de uma frase", () => {
    // Começa a meio da frase 2 (8.8–12.8): só as palavras a partir de ~10.8 entram.
    const cues = buildSubtitleCues(segments, { inSec: 10.8, outSec: 17.2 });
    const text = cues.map((c) => c.text).join(" ");
    expect(text).not.toMatch(/^Esta é a frase/);
    expect(cues[0].startSec).toBeGreaterThanOrEqual(0);
  });

  it("legendas consecutivas não se sobrepõem", () => {
    const cues = buildSubtitleCues(segments, { inSec: 0, outSec: 40 });
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startSec).toBeGreaterThanOrEqual(cues[i - 1].endSec - 1e-6);
    }
  });

  it("segmentos sem palavras usam o texto inteiro recortado", () => {
    const noWords = [{ idx: 0, startSec: 5, endSec: 9, speaker: null, text: "Sem alinhamento", words: [] }];
    const cues = buildSubtitleCues(noWords, { inSec: 6, outSec: 8 });
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({ startSec: 0, endSec: 2, text: "Sem alinhamento" });
  });

  it("devolve vazio quando não há fala no intervalo", () => {
    expect(buildSubtitleCues(segments, { inSec: 4.05, outSec: 4.35 })).toEqual([]);
  });

  it("prefixa o orador quando pedido", () => {
    const cues = buildSubtitleCues(segments, { inSec: 8.8, outSec: 17.2 }, { includeSpeaker: true });
    expect(cues[0].text.startsWith("SPEAKER_00:")).toBe(true);
  });
});

describe("buildSrt", () => {
  it("gera SRT válido numerado com timestamps rebaseados", () => {
    const srt = buildSrt(segments, { inSec: 8.8, outSec: 17.2 });
    const blocks = srt.trim().split("\n\n");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].split("\n")[0]).toBe("1");
    expect(blocks[0].split("\n")[1]).toMatch(/^00:00:00,000 --> 00:00:0\d,\d{3}$/);
    blocks.forEach((b, i) => expect(b.split("\n")[0]).toBe(String(i + 1)));
  });
});
