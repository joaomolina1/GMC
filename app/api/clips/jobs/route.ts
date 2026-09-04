import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { assertRateLimit } from "@lib/enterprise/rate-limit";
import { assertQuotaAvailable } from "@lib/enterprise/quotas";
import { logAudit } from "@lib/audit";
import { CLIPS_BUCKET, resolveClipJobParams } from "@lib/clips/types";

export const runtime = "nodejs";

/** Lista os jobs do utilizador com o asset associado. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("clip_jobs")
    .select("*, video_assets(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * Enfileira um job (`queued`). A Vercel só enfileira — o worker em container faz o trabalho.
 * Verifica que o objeto existe no Storage antes de aceitar (o upload TUS pode não ter terminado).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/clips/jobs", user.id);
  if (!rateCheck.ok) return NextResponse.json({ error: rateCheck.message }, { status: 429 });

  // O custo das chamadas ao Claude é debitado ao dono do job; bloqueia à entrada se a quota já estourou.
  const quotaCheck = await assertQuotaAvailable(supabase, user.id);
  if (!quotaCheck.ok) return NextResponse.json({ error: quotaCheck.message }, { status: 402 });

  const body = (await request.json().catch(() => ({}))) as {
    videoAssetId?: string;
    params?: Record<string, unknown>;
  };
  if (!body.videoAssetId) {
    return NextResponse.json({ error: "videoAssetId é obrigatório" }, { status: 400 });
  }

  const { data: asset } = await supabase
    .from("video_assets")
    .select("*")
    .eq("id", body.videoAssetId)
    .maybeSingle();
  if (!asset || asset.owner_id !== user.id) {
    return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  }

  const { data: active } = await supabase
    .from("clip_jobs")
    .select("id, status")
    .eq("video_asset_id", asset.id)
    .in("status", ["queued", "running"])
    .limit(1);
  if (active && active.length > 0) {
    return NextResponse.json(
      { error: "Já existe um job em curso para este vídeo", jobId: active[0].id },
      { status: 409 }
    );
  }

  // Confirma que o upload direto terminou: o objeto tem de existir no bucket.
  const folder = asset.storage_path.split("/").slice(0, -1).join("/");
  const objectName = asset.storage_path.split("/").pop() ?? "";
  const { data: objects, error: listError } = await supabase.storage
    .from(CLIPS_BUCKET)
    .list(folder, { search: objectName, limit: 10 });
  if (listError) {
    return NextResponse.json({ error: `Storage: ${listError.message}` }, { status: 500 });
  }
  const object = objects?.find((o) => o.name === objectName);
  if (!object) {
    return NextResponse.json(
      { error: "O ficheiro ainda não está no Storage. Conclua o upload antes de criar o job." },
      { status: 409 }
    );
  }

  const sizeFromStorage = (object.metadata as { size?: number } | null)?.size;
  if (sizeFromStorage && sizeFromStorage !== asset.size_bytes) {
    await supabase.from("video_assets").update({ size_bytes: sizeFromStorage }).eq("id", asset.id);
  }

  const params = resolveClipJobParams(body.params);

  const { data: job, error } = await supabase
    .from("clip_jobs")
    .insert({
      video_asset_id: asset.id,
      user_id: user.id,
      status: "queued",
      step: "probe",
      params,
    })
    .select()
    .single();

  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar job" }, { status: 500 });
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "clips.job.create",
    entityType: "clip_job",
    entityId: job.id,
    metadata: { videoAssetId: asset.id, params },
  });

  return NextResponse.json({ ...job, video_assets: asset }, { status: 201 });
}
