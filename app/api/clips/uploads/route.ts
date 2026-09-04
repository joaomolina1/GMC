import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { getSupabaseEnv } from "@lib/supabase/env";
import { assertRateLimit } from "@lib/enterprise/rate-limit";
import { logAudit } from "@lib/audit";
import { CLIPS_BUCKET, clipStoragePaths } from "@lib/clips/types";
import { isAcceptedClipExtension, CLIPS_ACCEPTED_EXTENSIONS } from "@lib/clips/config";

export const runtime = "nodejs";

/**
 * Regista um `video_assets` e devolve o destino para upload direto do browser
 * (TUS resumable → Supabase Storage). O ficheiro NUNCA passa por esta rota: a Vercel
 * limita o corpo do request a ~4,5 MB.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/clips/uploads", user.id);
  if (!rateCheck.ok) return NextResponse.json({ error: rateCheck.message }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
  };

  const filename = body.filename?.trim();
  if (!filename) return NextResponse.json({ error: "filename é obrigatório" }, { status: 400 });

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!isAcceptedClipExtension(ext)) {
    return NextResponse.json(
      { error: `Formato não suportado: .${ext}. Aceites: ${CLIPS_ACCEPTED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const sizeBytes = Number.isFinite(Number(body.sizeBytes)) && Number(body.sizeBytes) > 0 ? Math.round(Number(body.sizeBytes)) : null;

  const assetId = crypto.randomUUID();
  const storagePath = clipStoragePaths.source(user.id, assetId, ext);

  const { data: asset, error } = await supabase
    .from("video_assets")
    .insert({
      id: assetId,
      owner_id: user.id,
      filename,
      storage_path: storagePath,
      mime: body.mime?.trim() || null,
      size_bytes: sizeBytes,
    })
    .select()
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: error?.message ?? "Falha ao registar vídeo" }, { status: 500 });
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "clips.asset.create",
    entityType: "video_asset",
    entityId: asset.id,
    metadata: { filename, sizeBytes, mime: body.mime ?? null },
  });

  const { url } = getSupabaseEnv();
  return NextResponse.json({
    asset,
    upload: {
      protocol: "tus",
      endpoint: `${url.replace(/\/$/, "")}/storage/v1/upload/resumable`,
      bucket: CLIPS_BUCKET,
      objectName: storagePath,
      // O endpoint resumable do Supabase exige chunks de exatamente 6 MiB.
      chunkSize: 6 * 1024 * 1024,
    },
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("video_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
