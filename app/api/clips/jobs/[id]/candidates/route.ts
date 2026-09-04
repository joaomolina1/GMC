import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { CLIPS_BUCKET, type ClipCandidateRow, type ClipRenderRow } from "@lib/clips/types";
import { CLIPS_THUMBNAIL_URL_TTL_SEC } from "@lib/clips/config";

export const runtime = "nodejs";

type CandidateWithRenders = ClipCandidateRow & { clip_renders: ClipRenderRow[] };

/** Fila de candidatos do job (por score), com renders e thumbnails assinadas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job } = await supabase.from("clip_jobs").select("id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  const { data, error } = await supabase
    .from("clip_candidates")
    .select("*, clip_renders(*)")
    .eq("job_id", id)
    .order("score", { ascending: false })
    .order("in_sec", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []) as CandidateWithRenders[];

  const thumbPaths = candidates
    .map((c) => c.thumbnail_storage_path)
    .filter((p): p is string => Boolean(p));
  const thumbnails = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(CLIPS_BUCKET)
      .createSignedUrls(thumbPaths, CLIPS_THUMBNAIL_URL_TTL_SEC);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) thumbnails.set(s.path, s.signedUrl);
    }
  }

  return NextResponse.json(
    candidates.map((c) => ({
      ...c,
      clip_renders: [...(c.clip_renders ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      thumbnail_url: c.thumbnail_storage_path ? thumbnails.get(c.thumbnail_storage_path) ?? null : null,
    }))
  );
}
