import { NextResponse } from "next/server";
import { createClient, tryCreateServiceClient } from "@lib/supabase/server";
import { ingestKnowledgeFile } from "@lib/knowledge/ingest";
import { assertRateLimit } from "@lib/enterprise/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SERVICE_ROLE_HINT =
  "Configure SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) em Vercel → Production e faça redeploy.";

/** Importa um ficheiro já carregado no chat (bucket attachments) para o Knowledge do agente. */
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
      { error: `Importação indisponível: chave de serviço Supabase em falta. ${SERVICE_ROLE_HINT}` },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { agentId, storagePath, filename, mime } = body as {
    agentId?: string;
    storagePath?: string;
    filename?: string;
    mime?: string;
  };

  if (!agentId || !storagePath || !filename) {
    return NextResponse.json({ error: "agentId, storagePath e filename são obrigatórios" }, { status: 400 });
  }

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Caminho de anexo inválido" }, { status: 403 });
  }

  const { data: fileData, error: dlError } = await supabase.storage
    .from("attachments")
    .download(storagePath);

  if (dlError || !fileData) {
    return NextResponse.json({ error: "Anexo não encontrado no storage" }, { status: 404 });
  }

  try {
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const doc = await ingestKnowledgeFile({
      supabase,
      serviceClient,
      userId: user.id,
      agentId,
      buffer,
      filename,
      mime,
      source: "chat_import",
    });
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Importação falhou" },
      { status: 500 }
    );
  }
}
