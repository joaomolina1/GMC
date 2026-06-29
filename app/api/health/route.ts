import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@lib/supabase/env";
import { getServiceRoleKey } from "@lib/supabase/server";
import { getVoyageProvider } from "@lib/ai/providers/voyage";
import { getSkillStatuses } from "@lib/skills/skill-status";

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
    phase: 6,
    enterprise: true,
    entra: process.env.NEXT_PUBLIC_ENTRA_ENABLED === "true",
    supabase: supabaseConfigured,
    serviceRole: Boolean(getServiceRoleKey()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    voyage: voyage.isConfigured,
    embeddings: voyage.isConfigured ? "voyage-3" : "pseudo-hash (configure VOYAGE_API_KEY)",
    skills: getSkillStatuses(),
    timestamp: new Date().toISOString(),
  });
}
