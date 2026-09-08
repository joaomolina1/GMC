import { NextResponse } from "next/server";
import { authorizeLiveAccess, buildLive } from "@lib/pt26/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payload completo do ecrã do pivot (semanas publicadas + perguntas + quadros + resultados +
 * variações + imagens). Rota pública protegida pelo token `?key=` das Definições.
 * O ecrã carrega tudo de uma vez e não volta a pedir durante a emissão.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  try {
    const access = await authorizeLiveAccess(key);
    if (!access.ok) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const payload = await buildLive(access.service, false);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pt26/live]", e);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
