import { describe, expect, it } from "vitest";
import {
  segmentsNear,
  sentencesFromSegments,
  snapToBoundaries,
  wordsFromSegments,
  type SnapContext,
} from "@lib/clips/boundaries";
import { syntheticTranscript } from "@lib/clips/transcription/fixture";

/**
 * Transcrição sintética: frases de 4 s separadas por 0,4 s de silêncio.
 *  frase 0: 0.0 → 4.0   frase 1: 4.4 → 8.4   frase 2: 8.8 → 12.8   frase 3: 13.2 → 17.2 ...
 * Cada frase tem 9 palavras (~0,444 s cada).
 */
const segments = syntheticTranscript({ sentenceCount: 30, sentenceSec: 4, gapSec: 0.4 });
const VIDEO = 200;

function ctx(overrides: Partial<SnapContext> = {}): SnapContext {
  return {
    sentences: sentencesFromSegments(segments),
    words: wordsFromSegments(segments),
    shots: [],
    maxSnapSec: 1.5,
    minDurationSec: 5,
    maxDurationSec: 60,
    videoDurationSec: VIDEO,
    ...overrides,
  };
}

describe("snapToBoundaries — fronteiras de frase", () => {
  it("snapa in/out à fronteira de frase mais próxima dentro da tolerância", () => {
    // 4.7 está a 0.3 do início da frase 1 (4.4); 30.1 está perto do fim da frase 6 (30.4).
    const r = snapToBoundaries({ inSec: 4.7, outSec: 30.1 }, ctx());
    expect(r.inSec).toBe(4.4);
    expect(r.snappedIn).toEqual({ kind: "sentence", deltaSec: -0.3 });
    expect(r.outSec).toBe(30.4);
    expect(r.snappedOut.kind).toBe("sentence");
    expect(r.clamped).toBe(false);
  });

  it("é determinística", () => {
    const a = snapToBoundaries({ inSec: 4.7, outSec: 30.1 }, ctx());
    const b = snapToBoundaries({ inSec: 4.7, outSec: 30.1 }, ctx());
    expect(a).toEqual(b);
  });

  it("em empate, in prefere a fronteira mais cedo e out a mais tarde", () => {
    // Frases de 4 s coladas (gap 0): fim da frase k == início da frase k+1.
    const glued = syntheticTranscript({ sentenceCount: 10, sentenceSec: 4, gapSec: 0 });
    const c = ctx({ sentences: sentencesFromSegments(glued), words: wordsFromSegments(glued), videoDurationSec: 40 });
    // Ponto exatamente a meio entre início da frase 1 (4) e início da frase 2 (8): 6.
    const r = snapToBoundaries({ inSec: 6, outSec: 26 }, { ...c, maxSnapSec: 2 });
    expect(r.inSec).toBe(4);
    // Fins de frase 6 (28) e 5 (24) equidistantes de 26 → prefere o mais tarde.
    expect(r.outSec).toBe(28);
  });

  it("não mexe quando nada está dentro da tolerância e o ponto está em silêncio", () => {
    // 4.2 está no gap entre 4.0 e 4.4 mas a 0.2 de ambos; tolerância 0.1 não apanha nada.
    const r = snapToBoundaries({ inSec: 4.2, outSec: 30.2 }, ctx({ maxSnapSec: 0.1 }));
    expect(r.snappedIn.kind).toBe("none");
    expect(r.inSec).toBe(4.2);
  });
});

describe("snapToBoundaries — nunca a meio de palavra", () => {
  it("com tolerância zero mantém valores em silêncio", () => {
    const r = snapToBoundaries({ inSec: 4.2, outSec: 30.6 }, ctx({ maxSnapSec: 0 }));
    expect(r.inSec).toBe(4.2);
    expect(r.outSec).toBe(30.6);
    expect(r.snappedIn.kind).toBe("none");
    expect(r.snappedOut.kind).toBe("none");
  });

  it("com tolerância zero, um ponto a meio de palavra move-se para a fronteira da palavra", () => {
    // Frase 1 começa em 4.4; a 1ª palavra vai de 4.4 a ~4.824. 4.6 está a meio dela.
    const r = snapToBoundaries({ inSec: 4.6, outSec: 30.6 }, ctx({ maxSnapSec: 0 }));
    expect(r.snappedIn.kind).toBe("word");
    expect(r.inSec).toBe(4.4);
    // out a meio da última palavra da frase 6 (termina em 30.4) → vai ao fim da palavra.
    const r2 = snapToBoundaries({ inSec: 4.2, outSec: 30.3 }, ctx({ maxSnapSec: 0 }));
    expect(r2.snappedOut.kind).toBe("word");
    expect(r2.outSec).toBeCloseTo(30.38, 2);
  });

  it("sem lista de palavras usa as frases como aproximação", () => {
    const r = snapToBoundaries({ inSec: 6, outSec: 30.6 }, ctx({ words: undefined, maxSnapSec: 0 }));
    // 6 está dentro da frase 1 (4.4–8.4) → início da frase.
    expect(r.inSec).toBe(4.4);
    expect(r.snappedIn.kind).toBe("word");
  });
});

describe("snapToBoundaries — cortes de plano", () => {
  it("sem cortes de plano funciona só com frases", () => {
    const r = snapToBoundaries({ inSec: 4.5, outSec: 30.2 }, ctx({ shots: [] }));
    expect(r.snappedIn.kind).toBe("sentence");
    expect(r.snappedIn.shotSec).toBeUndefined();
  });

  it("prefere um corte de plano no silêncio imediatamente antes do início da frase", () => {
    // Frase 1 começa em 4.4; há um corte em 4.2 (gap silencioso 4.0–4.4).
    const r = snapToBoundaries({ inSec: 4.6, outSec: 30.2 }, ctx({ shots: [4.2] }));
    expect(r.inSec).toBe(4.2);
    expect(r.snappedIn).toEqual({ kind: "shot", deltaSec: -0.4, shotSec: 4.2 });
  });

  it("recusa um corte de plano que cortaria fala (dentro da frase)", () => {
    // Corte em 5.0 está dentro da frase 1 → cortar aí deixaria de fora a 1ª palavra.
    const r = snapToBoundaries({ inSec: 4.6, outSec: 30.2 }, ctx({ shots: [5.0] }));
    expect(r.inSec).toBe(4.4);
    expect(r.snappedIn.kind).toBe("sentence");
  });

  it("para o out, prefere um corte de plano no silêncio depois do fim da frase", () => {
    // Frase 6 termina em 30.4; frase 7 começa em 30.8. Corte em 30.6.
    const r = snapToBoundaries({ inSec: 4.4, outSec: 30.2 }, ctx({ shots: [30.6] }));
    expect(r.outSec).toBe(30.6);
    expect(r.snappedOut.kind).toBe("shot");
    expect(r.snappedOut.shotSec).toBe(30.6);
  });

  it("com cortes densos escolhe o mais próximo da fronteira que não corta fala", () => {
    const dense = [3.9, 4.05, 4.1, 4.3, 4.35, 4.5, 4.9];
    const r = snapToBoundaries({ inSec: 4.6, outSec: 30.2 }, ctx({ shots: dense }));
    // 4.5 e 4.9 estão dentro da frase (fala). 4.35 é o mais próximo de 4.4 em silêncio.
    expect(r.inSec).toBe(4.35);
    expect(r.snappedIn.kind).toBe("shot");
  });

  it("corte de plano em cima da fronteira não altera o valor mas fica registado", () => {
    const r = snapToBoundaries({ inSec: 4.6, outSec: 30.2 }, ctx({ shots: [4.4] }));
    expect(r.inSec).toBe(4.4);
    expect(r.snappedIn.kind).toBe("sentence");
    expect(r.snappedIn.shotSec).toBe(4.4);
  });
});

describe("snapToBoundaries — duração e limites", () => {
  it("troca in/out quando in > out e assinala", () => {
    const r = snapToBoundaries({ inSec: 30.2, outSec: 4.6 }, ctx());
    expect(r.inSec).toBeLessThan(r.outSec);
    expect(r.inSec).toBe(4.4);
    expect(r.clamped).toBe(true);
    expect(r.notes).toContain("in > out: valores trocados");
  });

  it("respeita a duração máxima recuando o out para uma fronteira", () => {
    const r = snapToBoundaries({ inSec: 0, outSec: 100 }, ctx({ maxDurationSec: 30 }));
    expect(r.outSec - r.inSec).toBeLessThanOrEqual(30 + 1e-6);
    expect(r.clamped).toBe(true);
    // 30 cai no gap depois da frase 6 (30.4)? Não: frase 6 = 26.4–30.4, logo 30 está a meio;
    // recuo → fim da frase 5 (25.2)? fim de frase mais próximo ≤ 30 dentro da tolerância 1.5 é 25.2? não (4.8 de distância).
    // Então cai na regra de palavra: 30 está dentro de uma palavra → recua para o início dessa palavra.
    expect(r.snappedOut.kind).toBe("word");
    expect(r.outSec).toBeLessThanOrEqual(30);
  });

  it("estende o out quando a duração é inferior ao mínimo", () => {
    const r = snapToBoundaries({ inSec: 4.4, outSec: 6 }, ctx({ minDurationSec: 10 }));
    expect(r.outSec - r.inSec).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(r.clamped).toBe(true);
    expect(r.notes.some((n) => n.includes("abaixo do mínimo"))).toBe(true);
  });

  it("no fim do vídeo recua o in para cumprir o mínimo", () => {
    const shortVideo = ctx({ videoDurationSec: 20, minDurationSec: 10 });
    const r = snapToBoundaries({ inSec: 17, outSec: 19 }, shortVideo);
    expect(r.outSec).toBeLessThanOrEqual(20);
    expect(r.outSec - r.inSec).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(r.notes.some((n) => n.includes("in recuado"))).toBe(true);
  });

  it("clampa aos limites do vídeo", () => {
    const r = snapToBoundaries({ inSec: -5, outSec: 500 }, ctx({ maxDurationSec: 1000 }));
    expect(r.inSec).toBeGreaterThanOrEqual(0);
    expect(r.outSec).toBeLessThanOrEqual(VIDEO);
    expect(r.clamped).toBe(true);
    expect(r.notes).toContain("intervalo fora dos limites do vídeo");
  });

  it("ignora entradas não finitas", () => {
    const r = snapToBoundaries({ inSec: Number.NaN, outSec: 30 }, ctx());
    expect(r.inSec).toBe(0);
    expect(r.outSec).toBeGreaterThan(0);
  });

  it("nunca devolve intervalo vazio", () => {
    const r = snapToBoundaries({ inSec: 4.4, outSec: 4.4 }, ctx({ minDurationSec: 0 }));
    expect(r.outSec).toBeGreaterThan(r.inSec);
    expect(r.clamped).toBe(true);
  });

  it("deltas refletem exatamente a diferença aplicada", () => {
    const r = snapToBoundaries({ inSec: 4.7, outSec: 30.1 }, ctx());
    expect(r.inSec).toBeCloseTo(4.7 + r.snappedIn.deltaSec, 3);
    expect(r.outSec).toBeCloseTo(30.1 + r.snappedOut.deltaSec, 3);
  });
});

describe("helpers", () => {
  it("segmentsNear devolve só os segmentos que podem influenciar o intervalo", () => {
    const near = segmentsNear(segments, { inSec: 10, outSec: 12 }, 3);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((s) => s.endSec >= 7 && s.startSec <= 15)).toBe(true);
    expect(near.length).toBeLessThan(segments.length);
  });

  it("wordsFromSegments usa o segmento inteiro quando não há palavras", () => {
    const words = wordsFromSegments([{ idx: 0, startSec: 1, endSec: 2, text: "x", words: [] }]);
    expect(words).toEqual([{ s: 1, e: 2 }]);
  });
});
