import { NextResponse } from "next/server";

/**
 * Autenticação dos handlers `/api/cron/*`.
 * Com `CRON_SECRET` definido, a Vercel envia `Authorization: Bearer $CRON_SECRET`.
 * Sem secret (deploy antigo), aceita só o user-agent da plataforma + `x-vercel-cron-schedule`.
 */
export function cronUnauthorized(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (cronSecret) {
    if (authHeader === `Bearer ${cronSecret}`) return null;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const schedule = request.headers.get("x-vercel-cron-schedule");
  if (ua.includes("vercel-cron") && schedule) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
