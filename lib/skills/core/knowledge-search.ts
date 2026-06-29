import { embedQuery } from "@lib/ai/embeddings";
import type { SkillDefinition } from "../types";

const SIMILARITY_THRESHOLD = 0.3;

export const knowledgeSearchSkill: SkillDefinition = {
  key: "knowledge_search",
  name: "Knowledge Search",
  description:
    "Search the agent's knowledge base for relevant information using semantic search. Use when the user asks about documents or knowledge uploaded to this agent.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      top_k: { type: "number", description: "Number of results (default 5)" },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = String(params.query);
    const topK = Number(params.top_k ?? 5);

    const embedding = await embedQuery(query);

    const { data, error } = await ctx.supabase.rpc("match_chunks", {
      p_agent_id: ctx.agentId,
      p_query_embedding: embedding,
      p_match_count: topK,
    });

    if (error) {
      return `Knowledge search error: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return "No relevant knowledge found for this query.";
    }

    const chunks = data as Array<{
      content: string;
      similarity: number;
      metadata: Record<string, unknown>;
    }>;

    const relevant = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);
    const results = relevant.length > 0 ? relevant : chunks.slice(0, 2);

    return results
      .map((chunk, i) => {
        const filename = chunk.metadata?.filename ?? "unknown";
        const page = chunk.metadata?.page ? `, pág. ${chunk.metadata.page}` : "";
        const model = chunk.metadata?.embedding_model ?? "";
        const modelTag = model === "voyage-3" ? "" : ` [${model}]`;
        return `[${i + 1}] (relevância: ${(chunk.similarity * 100).toFixed(0)}%, fonte: ${filename}${page})${modelTag}\n${chunk.content}`;
      })
      .join("\n\n---\n\n");
  },
};
