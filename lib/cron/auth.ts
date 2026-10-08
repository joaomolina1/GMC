import { NextResponse } from "next/server";

/**
 * Autenticação dos handlers `/api/cron/*`.
 * Com `CRON_SECRET` definido, a Vercel envia `Authorization: Bearer $CRON_SECRET`.
 * `CRON_SCHEDULER_SECRET` é o mesmo tipo de Bearer, usado pelo pg_cron do Supabase
 * nos horários que a conta Hobby da Vercel não deixa agendar (minuto e 5 minutos).
 * Sem nenhum secret (deploy antigo), aceita só o user-agent da plataforma + `x-vercel-cron-schedule`.
 */
export function cronUnauthorized(request: Request): NextResponse | null {
  const secrets = [process.env.CRON_SECRET, process.env.CRON_SCHEDULER_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const authHeader = request.headers.get("authorization");
  if (secrets.length > 0) {
    if (secrets.some((secret) => authHeader === `Bearer ${secret}`)) return null;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const schedule = request.headers.get("x-vercel-cron-schedule");
  if (ua.includes("vercel-cron") && schedule) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
