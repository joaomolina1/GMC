import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScript, spreadScript } from "../src/transcription/fixture";

describe("fixture script", () => {
  it("interpreta o guião com oradores, comentários e linhas em branco", () => {
    const lines = parseScript("# c\nSPEAKER_00: Olá.\n\ncontinua sem prefixo\nSPEAKER_01: Adeus.\n");
    expect(lines).toEqual([
      { speaker: "SPEAKER_00", text: "Olá." },
      { speaker: "SPEAKER_00", text: "continua sem prefixo" },
      { speaker: "SPEAKER_01", text: "Adeus." },
    ]);
  });

  it("distribui as frases pela duração sem sobreposição e dentro do áudio", async () => {
    const raw = await readFile(path.join(__dirname, "..", "fixtures", "talkshow-pt.txt"), "utf8");
    const lines = parseScript(raw);
    expect(lines.length).toBeGreaterThan(40);
    for (const duration of [120, 300, 1800]) {
      const segs = spreadScript(lines, duration);
      expect(segs).toHaveLength(lines.length);
      expect(segs[0].startSec).toBeGreaterThanOrEqual(0);
      expect(segs[segs.length - 1].endSec).toBeLessThanOrEqual(duration);
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].startSec).toBeGreaterThan(segs[i - 1].endSec);
      }
      for (const s of segs) {
        expect(s.words.length).toBe(s.text.split(/\s+/).length);
        expect(s.words[0].s).toBeCloseTo(s.startSec, 3);
        expect(s.words[s.words.length - 1].e).toBeLessThanOrEqual(s.endSec + 1e-6);
      }
    }
  });
});
