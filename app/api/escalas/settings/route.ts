import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { jsonError, readJson, requireEscala, respostaDb, settingsSchema } from "@lib/escalas/http";
import { saveSettings } from "@lib/escalas/repo";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const auth = await requireEscala(true);
  if ("error" in auth && auth.error) return auth.error;
  const body = await readJson(req, settingsSchema);
  if (body instanceof NextResponse) return body;
  try {
    await saveSettings(auth.supabase, body, auth.user.id);
    await logAudit(auth.supabase, {
      actorId: auth.user.id,
      action: "escala.settings.update",
      entityType: "escala_settings",
      entityId: "1",
      metadata: { ...body },
    });
    return NextResponse.json({ ok: true, settings: body });
  } catch (error) {
    return respostaDb(error);
  }
}

export function GET() {
  return jsonError("Usa GET /api/escalas", 405);
}
