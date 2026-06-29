import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { processKnowledgeDocument } from "@lib/ai/embeddings";
import { extractDocument } from "@lib/documents/extract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await request.json();
  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const { data: doc } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await supabase
    .from("knowledge_documents")
    .update({ status: "processing" })
    .eq("id", documentId);

  const { data: fileData, error: dlError } = await supabase.storage
    .from("knowledge")
    .download(doc.storage_path);

  if (dlError || !fileData) {
    await serviceClient
      .from("knowledge_documents")
      .update({ status: "error", metadata: { error: "Download failed" } })
      .eq("id", documentId);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }

  try {
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const extracted = await extractDocument(buffer, doc.filename, doc.mime ?? undefined);

    const { chunkCount } = await processKnowledgeDocument(
      serviceClient,
      doc.id,
      doc.agent_id,
      extracted.text,
      {
        filename: doc.filename,
        mime: extracted.mime,
        ocrUsed: extracted.extractionMethod === "ocr",
        charCount: extracted.charCount,
        pageCount: extracted.pageCount,
        pages: extracted.pages,
      }
    );

    return NextResponse.json({ success: true, chunk_count: chunkCount });
  } catch (err) {
    await serviceClient
      .from("knowledge_documents")
      .update({
        status: "error",
        metadata: { error: err instanceof Error ? err.message : "Reindex failed" },
      })
      .eq("id", documentId);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Reindex failed",
    }, { status: 500 });
  }
}
