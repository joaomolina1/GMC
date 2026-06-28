import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@lib/supabase/server";
import { processKnowledgeDocument } from "@lib/ai/embeddings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const agentId = formData.get("agentId") as string;

  if (!file || !agentId) {
    return NextResponse.json({ error: "file and agentId required" }, { status: 400 });
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
    })
    .select()
    .single();

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 });

  // Extract text
  let text = "";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (ext === "pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (["txt", "md", "csv"].includes(ext)) {
      text = buffer.toString("utf-8");
    } else {
      text = buffer.toString("utf-8").slice(0, 100000);
    }
  } catch {
    await serviceClient
      .from("knowledge_documents")
      .update({ status: "error" })
      .eq("id", doc.id);
    return NextResponse.json({ error: "Failed to extract text" }, { status: 500 });
  }

  try {
    await processKnowledgeDocument(serviceClient, doc.id, agentId, text);
  } catch (err) {
    await serviceClient
      .from("knowledge_documents")
      .update({ status: "error" })
      .eq("id", doc.id);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Embedding failed",
    }, { status: 500 });
  }

  return NextResponse.json(doc);
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
