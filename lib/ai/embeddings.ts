import { getVoyageProvider, getEmbeddingModel, pseudoEmbedding } from "@lib/ai/providers/voyage";
import { chunkText, type TextChunk } from "@lib/ai/chunking";

export { chunkText };

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const voyage = getVoyageProvider();
  if (voyage.isConfigured) {
    const { embeddings } = await voyage.embed({ input: texts });
    return embeddings;
  }
  return texts.map((t) => pseudoEmbedding(t));
}

export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

export async function embedQuery(text: string): Promise<number[]> {
  const voyage = getVoyageProvider();
  if (voyage.isConfigured) {
    return voyage.embedQuery(text);
  }
  return pseudoEmbedding(text);
}

export async function processKnowledgeDocument(
  supabase: Awaited<ReturnType<typeof import("@lib/supabase/server").createServiceClient>>,
  documentId: string,
  agentId: string,
  text: string,
  meta: {
    filename: string;
    mime?: string;
    ocrUsed?: boolean;
    pageCount?: number;
    charCount?: number;
    pages?: Array<{ page: number; text: string }>;
  }
) {
  await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);

  const chunks: TextChunk[] = chunkText(text, {
    filename: meta.filename,
    mime: meta.mime,
    pages: meta.pages,
  });

  if (chunks.length === 0) {
    await supabase
      .from("knowledge_documents")
      .update({
        status: "error",
        metadata: {
          error: "No text content extracted",
          ocr_used: meta.ocrUsed ?? false,
        },
      })
      .eq("id", documentId);
    return { chunkCount: 0 };
  }

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  const embeddingModel = getEmbeddingModel();

  const rows = chunks.map((chunk, i) => ({
    document_id: documentId,
    agent_id: agentId,
    content: chunk.content,
    embedding: embeddings[i],
    metadata: { ...chunk.metadata, embedding_model: embeddingModel },
  }));

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("knowledge_chunks").insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`Chunk insert failed: ${error.message}`);
  }

  await supabase
    .from("knowledge_documents")
    .update({
      status: "ready",
      metadata: {
        ocr_used: meta.ocrUsed ?? false,
        char_count: meta.charCount ?? text.length,
        page_count: meta.pageCount ?? meta.pages?.length ?? 1,
        chunk_count: chunks.length,
        embedding_model: embeddingModel,
      },
    })
    .eq("id", documentId);

  return { chunkCount: chunks.length };
}
