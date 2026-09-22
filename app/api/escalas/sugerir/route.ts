import { NextResponse } from "next/server";
import { readJson, requireEscala, respostaDb, sugerirSchema } from "@lib/escalas/http";
import { loadEstado } from "@lib/escalas/repo";
import { sugerirEscala } from "@lib/escalas/suggest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const body = await readJson(req, sugerirSchema);
  if (body instanceof NextResponse) return body;
  try {
    const { estado, settings, slots } = await loadEstado(auth.supabase, body.from, body.to);
    const resultado = sugerirEscala(estado, slots.filter((s) => s.date >= body.from && s.date <= body.to), settings);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    return respostaDb(error);
  }
}
