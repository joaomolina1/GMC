import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { syncAnthropicModels } from "@lib/ai/sync-anthropic-models";
import { tryCreateServiceClient } from "@lib/supabase/server";

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const serviceClient = await tryCreateServiceClient();
  const supabase = serviceClient ?? auth.supabase;

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
