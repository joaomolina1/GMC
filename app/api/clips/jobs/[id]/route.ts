import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export const runtime = "nodejs";

/** Estado do job: passo, progresso, erro e asset. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error } = await supabase
    .from("clip_jobs")
    .select("*, video_assets(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  const { count } = await supabase
    .from("clip_candidates")
    .select("id", { count: "exact", head: true })
    .eq("job_id", id);

  return NextResponse.json({ ...job, candidate_count: count ?? 0 });
}
