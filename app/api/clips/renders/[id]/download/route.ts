import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";
import { CLIPS_BUCKET, type ClipRenderRow } from "@lib/clips/types";
import { CLIPS_DOWNLOAD_URL_TTL_SEC } from "@lib/clips/config";

export const runtime = "nodejs";

/**
 * Signed URL de curta duração para o MP4 renderizado. Só quando `status = 'done'`.
 * A leitura do render já passa pela RLS (candidato → job → dono); o bucket é privado.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: render } = await supabase.from("clip_renders").select("*").eq("id", id).maybeSingle();
  if (!render) return NextResponse.json({ error: "Render não encontrado" }, { status: 404 });

  const r = render as ClipRenderRow;
  if (r.status !== "done" || !r.storage_path) {
    return NextResponse.json(
      { error: `Render ainda não concluído (estado: ${r.status})`, status: r.status },
      { status: 409 }
    );
  }

  const { data: candidate } = await supabase
    .from("clip_candidates")
    .select("title")
    .eq("id", r.candidate_id)
    .maybeSingle();
  const filename = `${(candidate?.title ?? "clip").replace(/[^\w\- ]+/g, "_").trim().slice(0, 60) || "clip"}.mp4`;

  const { data, error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .createSignedUrl(r.storage_path, CLIPS_DOWNLOAD_URL_TTL_SEC, { download: filename });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Ficheiro não encontrado" }, { status: 404 });
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "clips.render.download",
    entityType: "clip_render",
    entityId: id,
    metadata: { candidateId: r.candidate_id },
  });

  const wantsJson = request.headers.get("accept")?.includes("application/json");
  if (wantsJson) {
    return NextResponse.json({ url: data.signedUrl, expiresInSec: CLIPS_DOWNLOAD_URL_TTL_SEC, filename });
  }
  return NextResponse.redirect(data.signedUrl);
}
