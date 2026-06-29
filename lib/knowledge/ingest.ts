import type { SupabaseClient } from "@supabase/supabase-js";
import { processKnowledgeDocument } from "@lib/ai/embeddings";
import { extractDocument } from "@lib/documents/extract";

export interface IngestKnowledgeInput {
  supabase: SupabaseClient;
  serviceClient: SupabaseClient;
  userId: string;
  agentId: string;
  buffer: Buffer;
  filename: string;
  mime?: string;
  source?: string;
}

export async function ingestKnowledgeFile(input: IngestKnowledgeInput) {
  const { supabase, serviceClient, userId, agentId, buffer, filename, mime, source } = input;

  const storagePath = `${userId}/${agentId}/${Date.now()}-${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("knowledge")
    .upload(storagePath, buffer, { contentType: mime || "application/octet-stream" });

  if (uploadError) {
    throw new Error(`Storage: ${uploadError.message}`);
  }

  const { data: doc, error: docError } = await supabase
    .from("knowledge_documents")
    .insert({
      agent_id: agentId,
      filename,
      storage_path: storagePath,
      mime: mime || "application/octet-stream",
      status: "processing",
      uploaded_by: userId,
      metadata: { source: source ?? "upload" },
    })
    .select()
    .single();

  if (docError) throw new Error(docError.message);

  const extracted = await extractDocument(buffer, filename, mime);

  if (extracted.charCount === 0) {
    await serviceClient
      .from("knowledge_documents")
      .update({ status: "error", metadata: { error: "No text extracted", ocr_used: false } })
      .eq("id", doc.id);
    throw new Error("Não foi possível extrair texto deste ficheiro");
  }

  const { chunkCount } = await processKnowledgeDocument(
    serviceClient,
    doc.id,
    agentId,
    extracted.text,
    {
      filename,
      mime: extracted.mime,
      ocrUsed: extracted.extractionMethod === "ocr",
      charCount: extracted.charCount,
      pageCount: extracted.pageCount,
      pages: extracted.pages,
    }
  );

  const { data: updated } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", doc.id)
    .single();

  return { ...updated, chunk_count: chunkCount };
}
