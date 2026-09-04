import { NextResponse } from "next/server";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";

/**
 * Watchdog da fila de clips (cron Vercel). Só repõe leases expirados na fila — nunca executa
 * trabalho: o ffmpeg/ASR correm exclusivamente no worker em container.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("requeue_stale_clip_jobs");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? {});
}
