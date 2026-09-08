import { NextResponse } from "next/server";
import { withAdmin } from "@lib/pt26/admin";
import { buildLive } from "@lib/pt26/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Igual a /api/pt26/live mas inclui semanas em DRAFT. Só para admins (validação antes de publicar). */
export async function GET() {
  return withAdmin(async (ctx) => {
    const payload = await buildLive(ctx.supabase, true);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  });
}
