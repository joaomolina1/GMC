import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { processKnowledgeDocument } from "@lib/ai/embeddings";
import { extractDocument } from "@lib/documents/extract";
import { assertRateLimit } from "@lib/enterprise/rate-limit";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "xlsx", "xls", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg", "webp", "gif"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/knowledge/upload", user.id);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const agentId = formData.get("agentId") as string;

  if (!file || !agentId) {
    return NextResponse.json({ error: "file and agentId required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({
      error: `Formato não suportado: .${ext}. Aceites: ${ACCEPTED_EXTENSIONS.join(", ")}`,
    }, { status: 400 });
  }

  const storagePath = `${user.id}/${agentId}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("knowledge")
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: doc, error: docError } = await supabase
    .from("knowledge_documents")
    .insert({
      agent_id: agentId,
      filename: file.name,
      storage_path: storagePath,
      mime: file.type,
      status: "processing",
      uploaded_by: user.id,
      metadata: { source: "upload" },
    })
    .select()
    .single();

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 });

  try {
    const extracted = await extractDocument(buffer, file.name, file.type);

    if (extracted.charCount === 0) {
      await serviceClient
        .from("knowledge_documents")
        .update({ status: "error", metadata: { error: "No text extracted", ocr_used: false } })
        .eq("id", doc.id);
      return NextResponse.json({ error: "No text could be extracted from this file" }, { status: 422 });
    }

    const { chunkCount } = await processKnowledgeDocument(
      serviceClient,
      doc.id,
      agentId,
      extracted.text,
      {
        filename: file.name,
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

    return NextResponse.json({ ...updated, chunk_count: chunkCount });
  } catch (err) {
    await serviceClient
      .from("knowledge_documents")
      .update({
        status: "error",
        metadata: { error: err instanceof Error ? err.message : "Processing failed" },
      })
      .eq("id", doc.id);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Processing failed",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agentId = new URL(request.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docId = new URL(request.url).searchParams.get("id");
  if (!docId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: doc } = await supabase
    .from("knowledge_documents")
    .select("storage_path")
    .eq("id", docId)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await supabase.storage.from("knowledge").remove([doc.storage_path]);
  await serviceClient.from("knowledge_chunks").delete().eq("document_id", docId);
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
