import { NextResponse } from "next/server";
import { withAdmin } from "@lib/pt26/admin";
import { mediaBaseUrl } from "@lib/pt26/media";
import { loadReference, loadSettings } from "@lib/pt26/server";
import { getSupabaseEnv } from "@lib/supabase/env";

export const runtime = "nodejs";

/** Bootstrap do back-office: partidos, pessoas, perguntas, definições e base pública do bucket. */
export async function GET() {
  return withAdmin(async (ctx) => {
    const [ref, settings] = await Promise.all([loadReference(ctx.supabase), loadSettings(ctx.supabase)]);
    return NextResponse.json({
      ok: true,
      parties: ref.parties,
      people: ref.people,
      questions: ref.questions,
      settings: settings ?? { live_token: null, footer_text: null, logo_year: "26" },
      mediaBase: mediaBaseUrl(getSupabaseEnv().url),
    });
  });
}
