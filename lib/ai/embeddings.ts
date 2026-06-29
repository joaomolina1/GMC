export function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function embedText(text: string): Promise<number[]> {
  const { getProvider } = await import("@lib/ai/registry");
  const provider = getProvider("claude-sonnet-4-20250514");
  const { embeddings } = await provider.embed({ input: text });
  return embeddings[0];
}

export async function processKnowledgeDocument(
  supabase: Awaited<ReturnType<typeof import("@lib/supabase/server").createServiceClient>>,
  documentId: string,
  agentId: string,
  text: string
) {
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);
    await supabase.from("knowledge_chunks").insert({
      document_id: documentId,
      agent_id: agentId,
      content: chunks[i],
      embedding,
      metadata: { chunk_index: i },
    });
  }
  await supabase
    .from("knowledge_documents")
    .update({ status: "ready" })
    .eq("id", documentId);
}
