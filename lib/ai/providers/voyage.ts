import type { EmbedOptions, EmbedResult } from "../types";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-3";
const BATCH_SIZE = 128;

export class VoyageProvider {
  name = "voyage";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.VOYAGE_API_KEY ?? "";
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async embed(options: EmbedOptions): Promise<EmbedResult> {
    if (!this.apiKey) {
      throw new Error("VOYAGE_API_KEY not configured");
    }

    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const model = options.model ?? DEFAULT_MODEL;
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      const batch = inputs.slice(i, i + BATCH_SIZE);
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: batch,
          model,
          input_type: "document",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Voyage API error (${response.status}): ${err}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        usage: { total_tokens: number };
      };

      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((d) => d.embedding));
      totalTokens += data.usage.total_tokens;
    }

    return { embeddings: allEmbeddings, usage: { totalTokens } };
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("VOYAGE_API_KEY not configured");
    }

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [text],
        model: DEFAULT_MODEL,
        input_type: "query",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voyage API error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    return data.data[0].embedding;
  }
}

/** Deterministic pseudo-embedding fallback when Voyage is not configured */
export function pseudoEmbedding(text: string, dims = 1536): number[] {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * (i + 1)) % dims;
    vec[idx] += Math.sin(text.charCodeAt(i) * 0.1);
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

let _voyage: VoyageProvider | null = null;

export function getVoyageProvider(): VoyageProvider {
  if (!_voyage) _voyage = new VoyageProvider();
  return _voyage;
}

export function getEmbeddingModel(): string {
  return getVoyageProvider().isConfigured ? "voyage-3" : "pseudo-hash";
}
