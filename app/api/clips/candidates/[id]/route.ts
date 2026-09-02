import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";
import { loadCandidateWithContext, parseFiniteNumber, resnapRange } from "@lib/clips/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadCandidateWithContext(supabase, id);
  if (!ctx) return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  return NextResponse.json(ctx.candidate);
}

/**
 * Ajuste de in/out (e título) pelo editor. O intervalo pedido é re-snapado no servidor com a
 * mesma função pura do worker; a resposta inclui o que o snapping fez para a UI mostrar.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await loadCandidateWithContext(supabase, id);
  if (!ctx) return NextResponse.json({ error: "Candidato não encontrado" }, { status: 404 });
  if (ctx.candidate.status !== "pending") {
    return NextResponse.json({ error: "Candidato já decidido; não pode ser ajustado" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    inSec?: unknown;
    outSec?: unknown;
    title?: unknown;
    snap?: unknown;
  };

  const update: Record<string, unknown> = {};
  let snap: Awaited<ReturnType<typeof resnapRange>> | null = null;

  const inSec = parseFiniteNumber(body.inSec);
  const outSec = parseFiniteNumber(body.outSec);
  if (inSec !== null || outSec !== null) {
    const requested = {
      inSec: inSec ?? Number(ctx.candidate.in_sec),
      outSec: outSec ?? Number(ctx.candidate.out_sec),
    };
    if (requested.inSec < 0 || requested.outSec <= requested.inSec) {
      return NextResponse.json({ error: "Intervalo inválido: in deve ser ≥ 0 e out > in" }, { status: 400 });
    }
    const doSnap = body.snap !== false;
    if (doSnap) {
      snap = await resnapRange(supabase, ctx, requested);
      update.in_sec = snap.inSec;
      update.out_sec = snap.outSec;
      update.snap_debug = { ...snap, requested, source: "editor" };
    } else {
      const maxDur = ctx.asset.duration_sec ?? Number.POSITIVE_INFINITY;
      update.in_sec = Math.max(0, requested.inSec);
      update.out_sec = Math.min(maxDur, requested.outSec);
      update.snap_debug = { requested, source: "editor", snap: false };
    }
  }

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "Título não pode ser vazio" }, { status: 400 });
    update.title = title.slice(0, 120);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("clip_candidates")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Falha ao atualizar" }, { status: 500 });
  }

  await logAudit(supabase, {
    actorId: user.id,
    action: "clips.candidate.adjust",
    entityType: "clip_candidate",
    entityId: id,
    metadata: {
      before: { in_sec: ctx.candidate.in_sec, out_sec: ctx.candidate.out_sec, title: ctx.candidate.title },
      after: { in_sec: updated.in_sec, out_sec: updated.out_sec, title: updated.title },
      snap: snap ? { in: snap.snappedIn, out: snap.snappedOut, clamped: snap.clamped } : null,
    },
  });

  return NextResponse.json({ candidate: updated, snap });
}
