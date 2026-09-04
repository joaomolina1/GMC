import { describe, expect, it } from "vitest";
import { beatStarts, beatsToCues, beatsToVtt } from "@lib/tvibox/subtitles";
import type { Beat } from "@lib/tvibox/types";

const beats: Beat[] = [
  { dur: 8, shot: "a", lines: [] },
  { dur: 7, shot: "b", lines: [{ who: "Ana", text: "Olá." }, { who: "Rui", text: "Onde é que estiveste toda a noite?" }] },
  { dur: 7, shot: "c", lines: [{ who: "Ana", text: "Não te interessa." }] },
];

describe("beatsToCues", () => {
  it("mantém cada fala dentro do seu beat, por ordem", () => {
    const cues = beatsToCues(beats, 1.8);
    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBeGreaterThanOrEqual(1.8 + 8);
    expect(cues[1].end).toBeLessThanOrEqual(1.8 + 15 + 1e-6);
    expect(cues[1].start).toBeGreaterThan(cues[0].end);
    expect(cues[2].start).toBeGreaterThanOrEqual(1.8 + 15);
    // a fala mais longa recebe mais tempo
    expect(cues[1].end - cues[1].start).toBeGreaterThan(cues[0].end - cues[0].start);
  });

  it("aceita instantes de início impostos (transições sobrepostas)", () => {
    const starts = [0, 7.6, 14.2];
    const cues = beatsToCues(beats, 0, 0.4, 0.25, starts);
    expect(cues[0].start).toBeCloseTo(8.0, 5);
    expect(cues[2].start).toBeCloseTo(14.6, 5);
    expect(beatStarts(beats, 2)).toEqual([2, 10, 17]);
  });
});

describe("beatsToVtt", () => {
  it("gera WebVTT válido com vozes", () => {
    const vtt = beatsToVtt(beats);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/);
    expect(vtt).toContain("<v Rui>Onde é que estiveste toda a noite?");
  });
});
