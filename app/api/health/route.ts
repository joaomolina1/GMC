import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@lib/supabase/env";
import { getVoyageProvider } from "@lib/ai/providers/voyage";

export const runtime = "nodejs";

export async function GET() {
  let supabaseConfigured = false;
  try {
    getSupabaseEnv();
    supabaseConfigured = true;
  } catch {
    supabaseConfigured = false;
  }

  const voyage = getVoyageProvider();

  return NextResponse.json({
    status: supabaseConfigured ? "ok" : "degraded",
    phase: 4,
    plugins: ["http_request", "sql_query", "run_code"],
    supabase: supabaseConfigured,
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    voyage: voyage.isConfigured,
    embeddings: voyage.isConfigured ? "voyage-3" : "pseudo-hash (configure VOYAGE_API_KEY)",
    timestamp: new Date().toISOString(),
  });
}
