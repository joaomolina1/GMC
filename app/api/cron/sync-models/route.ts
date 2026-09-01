import { NextResponse } from "next/server";
import { syncAnthropicModels } from "@lib/ai/sync-anthropic-models";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";

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

  try {
    const result = await syncAnthropicModels(supabase);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
