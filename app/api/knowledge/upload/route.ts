import { NextResponse } from "next/server";
import { createClient, tryCreateServiceClient } from "@lib/supabase/server";
import { ingestKnowledgeFile } from "@lib/knowledge/ingest";
import { assertRateLimit } from "@lib/enterprise/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "xlsx", "xls", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg", "webp", "gif"];

const SERVICE_ROLE_HINT =
  "Configure SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) em Vercel → Production e faça redeploy.";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/knowledge/upload", user.id);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const serviceClient = await tryCreateServiceClient();
  if (!serviceClient) {
    return NextResponse.json(
      { error: `Upload indisponível: chave de serviço Supabase em falta. ${SERVICE_ROLE_HINT}` },
      { status: 503 }
    );
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

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const doc = await ingestKnowledgeFile({
      supabase,
      serviceClient,
      userId: user.id,
      agentId,
      buffer,
      filename: file.name,
      mime: file.type,
      source: "upload",
    });
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
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
  const serviceClient = await tryCreateServiceClient();
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
  if (serviceClient) {
    await serviceClient.from("knowledge_chunks").delete().eq("document_id", docId);
  }
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
