import { describe, expect, it } from "vitest";
import { buildTranscriptWindows, formatSegmentLine } from "@lib/clips/windows";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";

describe("buildTranscriptWindows", () => {
  // 100 frases × 4,4 s ≈ 440 s de programa.
  const segments = syntheticTranscript({ sentenceCount: 100, sentenceSec: 4, gapSec: 0.4 });

  it("devolve vazio sem segmentos", () => {
    expect(buildTranscriptWindows([], { windowSec: 60, overlapSec: 10, maxChars: 5000 })).toEqual([]);
  });

  it("cobre todos os segmentos e sobrepõe janelas consecutivas", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 120, overlapSec: 20, maxChars: 100_000 });
    expect(windows.length).toBeGreaterThan(1);
    const covered = new Set(windows.flatMap((w) => w.segments.map((s) => s.idx)));
    expect(covered.size).toBe(segments.length);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startSec).toBeLessThan(windows[i - 1].endSec);
      expect(windows[i].startSec).toBeGreaterThan(windows[i - 1].startSec);
      expect(windows[i].index).toBe(i);
    }
  });

  it("respeita windowSec aproximadamente", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 60, overlapSec: 0, maxChars: 100_000 });
    for (const w of windows) {
      expect(w.endSec - w.startSec).toBeLessThanOrEqual(60 + 4.4);
    }
  });

  it("fecha a janela mais cedo quando o texto excede maxChars", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 600, overlapSec: 0, maxChars: 600 });
    expect(windows.length).toBeGreaterThan(1);
    for (const w of windows) {
      expect(w.text.length).toBeLessThanOrEqual(600 + 1);
    }
  });

  it("uma janela inclui sempre pelo menos um segmento, mesmo com maxChars minúsculo", () => {
    // Cada linha tem ~75 caracteres; com o mínimo de 200 cabem 2 por janela.
    const windows = buildTranscriptWindows(segments.slice(0, 3), { windowSec: 600, overlapSec: 0, maxChars: 200 });
    expect(windows.every((w) => w.segments.length >= 1 && w.segments.length <= 2)).toBe(true);
    expect(windows.length).toBe(2);
    expect(windows.flatMap((w) => w.segments.map((s) => s.idx))).toEqual([0, 1, 2]);
  });

  it("uma só janela quando tudo cabe", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 10_000, overlapSec: 60, maxChars: 1_000_000 });
    expect(windows).toHaveLength(1);
    expect(windows[0].segments).toHaveLength(100);
  });

  it("ignora segmentos vazios e ordena por tempo", () => {
    const shuffled = [
      { idx: 2, startSec: 20, endSec: 24, text: "terceira", words: [] },
      { idx: 1, startSec: 10, endSec: 14, text: "   ", words: [] },
      { idx: 0, startSec: 0, endSec: 4, text: "primeira", words: [] },
    ];
    const windows = buildTranscriptWindows(shuffled, { windowSec: 600, overlapSec: 0, maxChars: 5000 });
    expect(windows[0].segments.map((s) => s.idx)).toEqual([0, 2]);
  });

  it("formata linhas com timecode e orador", () => {
    const line = formatSegmentLine({ idx: 0, startSec: 65.25, endSec: 70, speaker: "SPEAKER_01", text: " Olá ", words: [] });
    expect(line).toBe("[1:05.3 → 1:10.0] SPEAKER_01: Olá");
  });
});
