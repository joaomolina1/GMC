import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLIP_PROMPTS, candidateSelectionPrompt, getClipPrompt, visualValidationPrompt } from "@lib/clips/prompts";

/**
 * Snapshot + versão: se o texto de um prompt mudar sem bump de `version`, o hash aqui
 * registado deixa de coincidir e o teste falha. Ao alterar um prompt:
 *   1. incrementa `version` no módulo do prompt;
 *   2. atualiza o hash esperado abaixo com o valor impresso na falha.
 */
const EXPECTED: Record<string, { version: number; sha256: string }> = {
  "clips.candidate-selection": {
    version: 1,
    sha256: "2c98e357ee520b2e80e57e1585bfeb5c9735caff279e9a4d3a2f033ee2b75831",
  },
  "clips.visual-validation": {
    version: 1,
    sha256: "cdeeff871b8dbcd386bd60ddd8b13cd76975b9893498d048e68dfce2919d6bd4",
  },
};

const selectionSample = candidateSelectionPrompt.build({
  windowText: "[0:00.0 → 0:04.0] SPEAKER_00: Olá a todos.",
  windowStartSec: 0,
  windowEndSec: 4,
  minDurationSec: 20,
  maxDurationSec: 90,
  maxCandidates: 4,
  language: "pt",
  programContext: "Talk-show noturno",
});

const visionSample = visualValidationPrompt.build({
  title: "Título",
  rationale: "Justificação",
  transcriptExcerpt: "Excerto",
  frameCount: 3,
  frameOffsetsSec: [1, 5, 9],
});

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("registry de prompts", () => {
  it("regista todos os prompts por id", () => {
    expect(Object.keys(CLIP_PROMPTS).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(getClipPrompt("clips.candidate-selection")).toBe(candidateSelectionPrompt);
    expect(() => getClipPrompt("inexistente")).toThrow();
  });

  it("versões são inteiros positivos", () => {
    for (const p of Object.values(CLIP_PROMPTS)) {
      expect(Number.isInteger(p.version) && p.version >= 1).toBe(true);
    }
  });
});

describe("candidate-selection", () => {
  it("é determinístico e inclui as regras essenciais", () => {
    const again = candidateSelectionPrompt.build({
      windowText: "[0:00.0 → 0:04.0] SPEAKER_00: Olá a todos.",
      windowStartSec: 0,
      windowEndSec: 4,
      minDurationSec: 20,
      maxDurationSec: 90,
      maxCandidates: 4,
      language: "pt",
      programContext: "Talk-show noturno",
    });
    expect(again).toEqual(selectionSample);
    expect(selectionSample.system).toContain("entre 20 e 90 segundos");
    expect(selectionSample.system).toContain("no máximo 4 candidatos");
    expect(selectionSample.system).toContain("Nunca inventes tempos");
    expect(selectionSample.user).toContain("Contexto do programa: Talk-show noturno");
    expect(selectionSample.user).toContain("Olá a todos.");
  });

  it("snapshot: texto alterado exige bump de version", () => {
    const expected = EXPECTED[candidateSelectionPrompt.id];
    expect(candidateSelectionPrompt.version).toBe(expected.version);
    expect(hash(`${selectionSample.system}\n---\n${selectionSample.user}`)).toBe(expected.sha256);
  });
});

describe("visual-validation", () => {
  it("lista os frames e pede JSON", () => {
    expect(visionSample.user).toContain("frame 0: +1.0s, frame 1: +5.0s, frame 2: +9.0s");
    expect(visionSample.system).toContain("best_frame_index");
  });

  it("snapshot: texto alterado exige bump de version", () => {
    const expected = EXPECTED[visualValidationPrompt.id];
    expect(visualValidationPrompt.version).toBe(expected.version);
    expect(hash(`${visionSample.system}\n---\n${visionSample.user}`)).toBe(expected.sha256);
  });
});
