import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { loadCandidateWithContext, storagePathBelongsTo } from "@lib/clips/server";
import { CLIPS_BUCKET } from "@lib/clips/types";
import { CLIPS_PREVIEW_URL_TTL_SEC } from "@lib/clips/config";

export const runtime = "nodejs";

/**
 * Signed URL do vídeo original para preview. A UI faz `<video>` + `currentTime` no intervalo
 * do candidato — não há render para pré-visualizar. Só o dono do asset (RLS + prefixo da pasta).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadCandidateWithContext(supabase, id);
  if (!ctx) return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  if (!storagePathBelongsTo(ctx.asset.storage_path, ctx.asset.owner_id)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data, error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .createSignedUrl(ctx.asset.storage_path, CLIPS_PREVIEW_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Ficheiro não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresInSec: CLIPS_PREVIEW_URL_TTL_SEC,
    inSec: ctx.candidate.in_sec,
    outSec: ctx.candidate.out_sec,
    durationSec: ctx.asset.duration_sec,
    mime: ctx.asset.mime,
  });
}
