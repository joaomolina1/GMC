import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@lib/supabase/env";

export const runtime = "nodejs";

export async function GET() {
  let supabaseConfigured = false;
  try {
    getSupabaseEnv();
    supabaseConfigured = true;
  } catch {
    supabaseConfigured = false;
  }

  return NextResponse.json({
    status: supabaseConfigured ? "ok" : "degraded",
    supabase: supabaseConfigured,
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    timestamp: new Date().toISOString(),
  });
}
