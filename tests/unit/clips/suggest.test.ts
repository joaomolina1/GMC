import { describe, expect, it, vi } from "vitest";
import {
  ClipSuggestParseError,
  candidatesFromWindow,
  clampToWindow,
  dedupeCandidates,
  overlapRatio,
  parseCandidateResponse,
  suggestCandidates,
  type ModelGenerateFn,
} from "@lib/clips/suggest";
import { DEFAULT_CLIP_JOB_PARAMS, type CandidateSegment, type ClipJobParams } from "@lib/clips/types";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";
import { buildTranscriptWindows } from "@lib/clips/windows";

vi.mock("@lib/ai/registry", () => ({
  getProvider: () => {
    throw new Error("O Claude real não deve ser chamado nos testes");
  },
  computeModelCost: (_model: string, usage: { promptTokens: number; completionTokens: number }) =>
    (usage.promptTokens * 3 + usage.completionTokens * 15) / 1_000_000,
}));

const segments = syntheticTranscript({ sentenceCount: 60, sentenceSec: 4, gapSec: 0.4 }); // ≈ 264 s
const params: ClipJobParams = {
  ...DEFAULT_CLIP_JOB_PARAMS,
  minDurationSec: 10,
  maxDurationSec: 60,
  windowSec: 120,
  overlapSec: 20,
  candidatesPerWindow: 3,
  maxCandidates: 5,
};

function fakeGenerate(responses: Record<number, string> | ((windowIndex: number, user: string) => string)): ModelGenerateFn & {
  calls: { system: string; user: string }[];
} {
  const calls: { system: string; user: string }[] = [];
  const fn = (async ({ system, user }: { system: string; user: string }) => {
    calls.push({ system, user });
    const match = user.match(/Excerto: ([\d.]+)s → ([\d.]+)s/);
    const start = match ? Number(match[1]) : 0;
    const windowIndex = Math.round(start / 100); // janelas começam em ~0, ~100, ~200
    const content =
      typeof responses === "function" ? responses(windowIndex, user) : (responses[windowIndex] ?? '{"candidates":[]}');
    return { content, usage: { promptTokens: 1000, completionTokens: 100 } };
  }) as unknown as ModelGenerateFn & { calls: { system: string; user: string }[] };
  fn.calls = calls;
  return fn;
}

describe("parseCandidateResponse", () => {
  it("aceita JSON puro", () => {
    const out = parseCandidateResponse(
      '{"candidates":[{"title":"T","start_sec":1,"end_sec":30,"score":80,"rationale":"r","speakers":["A"]}]}'
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("T");
  });

  it("aceita JSON dentro de cercas markdown e com texto à volta", () => {
    const out = parseCandidateResponse('Aqui vai:\n```json\n{"candidates":[{"title":"T","start_sec":1,"end_sec":30,"score":50}]}\n```\nfim');
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toBe("");
    expect(out[0].speakers).toEqual([]);
  });

  it("rejeita respostas sem JSON ou fora do schema", () => {
    expect(() => parseCandidateResponse("não há candidatos")).toThrow(ClipSuggestParseError);
    expect(() => parseCandidateResponse('{"candidates":[{"title":"","start_sec":"x"}]}')).toThrow(ClipSuggestParseError);
    expect(() => parseCandidateResponse('{"candidates":[{"title":"T","start_sec":1,"end_sec":2,"score":150}]}')).toThrow(
      ClipSuggestParseError
    );
  });

  it("lista vazia é válida", () => {
    expect(parseCandidateResponse('{"candidates":[]}')).toEqual([]);
    expect(parseCandidateResponse("{}")).toEqual([]);
  });
});

describe("clampToWindow / overlapRatio / dedupe", () => {
  it("clampa timestamps do modelo à janela e ao transcript", () => {
    const r = clampToWindow({ start_sec: -10, end_sec: 500 }, { startSec: 0, endSec: 120 }, { startSec: 0, endSec: 264 });
    expect(r).toEqual({ inSec: 0, outSec: 120 });
  });

  it("devolve null quando o intervalo fica vazio", () => {
    expect(clampToWindow({ start_sec: 300, end_sec: 310 }, { startSec: 0, endSec: 120 }, { startSec: 0, endSec: 264 })).toBeNull();
    expect(clampToWindow({ start_sec: 50, end_sec: 50.5 }, { startSec: 0, endSec: 120 }, { startSec: 0, endSec: 264 })).toBeNull();
  });

  it("overlapRatio é IoU", () => {
    expect(overlapRatio({ inSec: 0, outSec: 10 }, { inSec: 5, outSec: 15 })).toBeCloseTo(5 / 15);
    expect(overlapRatio({ inSec: 0, outSec: 10 }, { inSec: 10, outSec: 20 })).toBe(0);
    expect(overlapRatio({ inSec: 0, outSec: 10 }, { inSec: 0, outSec: 10 })).toBe(1);
  });

  it("dedupe mantém o de maior score entre sobrepostos", () => {
    const mk = (inSec: number, outSec: number, score: number, windowIndex = 0): CandidateSegment => ({
      title: `c${score}`,
      score,
      rationale: "",
      modelInSec: inSec,
      modelOutSec: outSec,
      inSec,
      outSec,
      speakers: [],
      transcriptExcerpt: "",
      windowIndex,
      snap: { inSec, outSec, snappedIn: { kind: "none", deltaSec: 0 }, snappedOut: { kind: "none", deltaSec: 0 }, clamped: false, notes: [] },
    });
    const kept = dedupeCandidates([mk(0, 30, 60, 0), mk(2, 31, 90, 1), mk(100, 130, 70), mk(115, 145, 10)]);
    expect(kept.map((c) => c.score)).toEqual([90, 70, 10]);
  });
});

describe("candidatesFromWindow", () => {
  it("snapa aos limites de frase e guarda os tempos do modelo", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 120, overlapSec: 20, maxChars: 100_000 });
    // Frase 2 começa em 8.8; frase 8 termina em 39.2. O modelo devolve valores ligeiramente errados.
    const { candidates, dropped } = candidatesFromWindow(
      [{ title: "Momento", start_sec: 9.1, end_sec: 38.9, score: 77, rationale: "bom", speakers: [] }],
      windows[0],
      { segments, shots: [], videoDurationSec: 300, params }
    );
    expect(dropped).toBe(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].modelInSec).toBe(9.1);
    expect(candidates[0].inSec).toBe(8.8);
    expect(candidates[0].outSec).toBe(39.2);
    expect(candidates[0].snap.snappedIn.kind).toBe("sentence");
    expect(candidates[0].speakers).toEqual(["SPEAKER_00", "SPEAKER_01"]);
    expect(candidates[0].transcriptExcerpt).toContain("frase número 3");
  });

  it("descarta candidatos fora da janela", () => {
    const windows = buildTranscriptWindows(segments, { windowSec: 120, overlapSec: 20, maxChars: 100_000 });
    const { candidates, dropped } = candidatesFromWindow(
      [{ title: "Fora", start_sec: 900, end_sec: 950, score: 77, rationale: "", speakers: [] }],
      windows[0],
      { segments, shots: [], videoDurationSec: 300, params }
    );
    expect(candidates).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

describe("suggestCandidates (Claude mockado)", () => {
  it("chama o modelo por janela, deduplica entre janelas, soma custo e reporta uso", async () => {
    const generate = fakeGenerate({
      0: '{"candidates":[{"title":"A","start_sec":9,"end_sec":39,"score":80,"rationale":"a"},{"title":"B","start_sec":60,"end_sec":100,"score":40,"rationale":"b"}]}',
      1: '{"candidates":[{"title":"A2","start_sec":100.5,"end_sec":131,"score":75,"rationale":"sobrepõe B"},{"title":"C","start_sec":150,"end_sec":190,"score":90,"rationale":"c"}]}',
      2: '{"candidates":[{"title":"D","start_sec":220,"end_sec":260,"score":65,"rationale":"d"}]}',
    });
    const usageEvents: number[] = [];
    const result = await suggestCandidates({
      segments,
      shots: [],
      videoDurationSec: 300,
      params,
      model: "claude-sonnet-4-5",
      generate,
      onUsage: (e) => {
        usageEvents.push(e.windowIndex);
      },
    });

    expect(result.windows).toBeGreaterThanOrEqual(3);
    expect(generate.calls.length).toBe(result.windows);
    expect(usageEvents.length).toBe(result.windows);
    expect(result.usage.promptTokens).toBe(1000 * result.windows);
    expect(result.costEur).toBeCloseTo(((1000 * 3 + 100 * 15) / 1_000_000) * result.windows, 9);
    expect(result.promptId).toBe("clips.candidate-selection");
    expect(result.promptVersion).toBe(1);

    const titles = result.candidates.map((c) => c.title);
    expect(titles).toContain("C");
    expect(titles).toContain("A");
    expect(titles).toContain("D");
    expect(result.candidates.length).toBeLessThanOrEqual(params.maxCandidates);
    // Ordenado por score desc.
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score);
    }
    // Todos dentro dos limites de duração e do transcript.
    for (const c of result.candidates) {
      expect(c.outSec - c.inSec).toBeGreaterThanOrEqual(params.minDurationSec - 1e-6);
      expect(c.outSec - c.inSec).toBeLessThanOrEqual(params.maxDurationSec + 1e-6);
      expect(c.inSec).toBeGreaterThanOrEqual(0);
    }
    // O prompt contém a transcrição da janela, não o vídeo.
    expect(generate.calls[0].user).toContain("frase número 1");
    expect(generate.calls[0].system).toContain("fonte de verdade");
  });

  it("clampa timestamps que o modelo inventa fora do transcript", async () => {
    const generate = fakeGenerate((i) =>
      i === 0
        ? '{"candidates":[{"title":"Inventado","start_sec":-50,"end_sec":30,"score":70,"rationale":""}]}'
        : '{"candidates":[]}'
    );
    const result = await suggestCandidates({ segments, shots: [], videoDurationSec: 300, params, model: "claude-sonnet-4-5", generate });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].inSec).toBeGreaterThanOrEqual(0);
    expect(result.candidates[0].modelInSec).toBe(0);
  });

  it("repete uma vez quando a resposta não é JSON e depois falha", async () => {
    let calls = 0;
    const generate: ModelGenerateFn = async () => {
      calls++;
      return { content: "não sei", usage: { promptTokens: 10, completionTokens: 1 } };
    };
    await expect(
      suggestCandidates({ segments, shots: [], videoDurationSec: 300, params, model: "claude-sonnet-4-5", generate })
    ).rejects.toBeInstanceOf(ClipSuggestParseError);
    expect(calls).toBe(2);
  });

  it("recupera quando a segunda tentativa devolve JSON", async () => {
    let calls = 0;
    const generate: ModelGenerateFn = async ({ user }) => {
      calls++;
      const retry = user.includes("não era JSON válido");
      return {
        content: retry ? '{"candidates":[]}' : "texto livre",
        usage: { promptTokens: 10, completionTokens: 1 },
      };
    };
    const result = await suggestCandidates({ segments, shots: [], videoDurationSec: 300, params, model: "claude-sonnet-4-5", generate });
    expect(result.candidates).toEqual([]);
    expect(calls).toBe(result.windows * 2);
  });

  it("sem segmentos não chama o modelo", async () => {
    const generate = vi.fn<ModelGenerateFn>();
    const result = await suggestCandidates({ segments: [], shots: [], videoDurationSec: 0, params, model: "claude-sonnet-4-5", generate });
    expect(result.windows).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });
});
