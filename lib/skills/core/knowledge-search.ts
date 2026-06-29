import { getProvider } from "@lib/ai/registry";
import type { SkillDefinition } from "../types";

export const knowledgeSearchSkill: SkillDefinition = {
  key: "knowledge_search",
  name: "Knowledge Search",
  description:
    "Search the agent's knowledge base for relevant information. Use when the user asks about documents or knowledge uploaded to this agent.",
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

    const provider = getProvider("claude-sonnet-4-20250514");
    const { embeddings } = await provider.embed({ input: query });
    const embedding = embeddings[0];

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

    return (data as Array<{ content: string; similarity: number; metadata: Record<string, unknown> }>)
      .map((chunk, i) => {
        const source = chunk.metadata?.filename ?? "unknown";
        return `[${i + 1}] (similarity: ${chunk.similarity.toFixed(3)}, source: ${source})\n${chunk.content}`;
      })
      .join("\n\n---\n\n");
  },
};
