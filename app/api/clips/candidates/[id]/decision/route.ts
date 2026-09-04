import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { assertRateLimit } from "@lib/enterprise/rate-limit";
import { logAudit } from "@lib/audit";
import { loadCandidateWithContext, parseFiniteNumber, resnapRange } from "@lib/clips/server";

export const runtime = "nodejs";

/**
 * Aprova/rejeita um candidato. Tudo acontece na RPC `decide_clip_candidate` (SECURITY DEFINER,
 * transação única): regista em `clip_decisions` (append-only), muda o estado e, se aprovado,
 * cria o `clip_renders` — cuja inserção o trigger só aceita para candidatos 'approved'.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/clips/decision", user.id);
  if (!rateCheck.ok) return NextResponse.json({ error: rateCheck.message }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    decision?: string;
    reason?: string;
    inSec?: unknown;
    outSec?: unknown;
    burnSubtitles?: unknown;
  };

  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ error: "decision deve ser 'approved' ou 'rejected'" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (decision === "rejected" && !reason) {
    return NextResponse.json({ error: "Motivo obrigatório para rejeitar" }, { status: 400 });
  }

  const ctx = await loadCandidateWithContext(supabase, id);
  if (!ctx) return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  if (ctx.candidate.status !== "pending") {
    return NextResponse.json({ error: `Candidato já decidido (${ctx.candidate.status})` }, { status: 409 });
  }

  // Ajuste final opcional no momento da decisão — re-snapado como no PATCH.
  let inSec: number | null = null;
  let outSec: number | null = null;
  let snap: Awaited<ReturnType<typeof resnapRange>> | null = null;
  const reqIn = parseFiniteNumber(body.inSec);
  const reqOut = parseFiniteNumber(body.outSec);
  if (reqIn !== null || reqOut !== null) {
    const requested = {
      inSec: reqIn ?? Number(ctx.candidate.in_sec),
      outSec: reqOut ?? Number(ctx.candidate.out_sec),
    };
    if (requested.inSec < 0 || requested.outSec <= requested.inSec) {
      return NextResponse.json({ error: "Intervalo inválido" }, { status: 400 });
    }
    snap = await resnapRange(supabase, ctx, requested);
    inSec = snap.inSec;
    outSec = snap.outSec;
  }

  const { data, error } = await supabase.rpc("decide_clip_candidate", {
    p_candidate_id: id,
    p_decision: decision,
    p_reason: reason || null,
    p_in_sec: inSec,
    p_out_sec: outSec,
    p_burn_subtitles: body.burnSubtitles === undefined ? true : Boolean(body.burnSubtitles),
  });

  if (error) {
    const status = /já decidido|Motivo obrigatório|Intervalo inválido/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const result = data as { candidate_id: string; status: string; in_sec: number; out_sec: number; render_id: string | null };

  await logAudit(supabase, {
    actorId: user.id,
    action: decision === "approved" ? "clips.candidate.approve" : "clips.candidate.reject",
    entityType: "clip_candidate",
    entityId: id,
    metadata: {
      jobId: ctx.job.id,
      reason: reason || null,
      in_sec: result.in_sec,
      out_sec: result.out_sec,
      render_id: result.render_id,
      snap: snap ? { in: snap.snappedIn, out: snap.snappedOut, clamped: snap.clamped } : null,
    },
  });

  return NextResponse.json({ ...result, snap });
}
