import { embedQuery } from "@lib/ai/embeddings";

const SIMILARITY_THRESHOLD = 0.3;

/**
 * Automatically inject relevant knowledge chunks into the system prompt.
 * Replaces the old knowledge_search skill — no tool call needed.
 */
export async function buildKnowledgeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  agentId: string,
  userMessage: string
): Promise<string | undefined> {
  const { count } = await supabase
    .from("knowledge_chunks")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agentId);

  if (!count) return undefined;

  const embedding = await embedQuery(userMessage);

  const { data, error } = await supabase.rpc("match_chunks", {
    p_agent_id: agentId,
    p_query_embedding: embedding,
    p_match_count: 5,
  });

  if (error || !data?.length) return undefined;

  const chunks = data as Array<{
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;

  const relevant = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);
  const results = relevant.length > 0 ? relevant : chunks.slice(0, 2);

  const formatted = results
    .map((chunk, i) => {
      const filename = chunk.metadata?.filename ?? "documento";
      const page = chunk.metadata?.page ? `, pág. ${chunk.metadata.page}` : "";
      return `[${i + 1}] (${filename}${page})\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  return `\n\n## Base de conhecimento relevante\nUsa esta informação quando aplicável:\n\n${formatted}`;
}
