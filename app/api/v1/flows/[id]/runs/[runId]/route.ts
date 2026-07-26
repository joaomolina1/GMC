import { NextResponse } from "next/server";
import {
  authenticateV1Request,
  requireOwnedFlow,
} from "@lib/enterprise/v1-helpers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const { id: flowId, runId } = await params;
  const auth = await authenticateV1Request(request, "flows:read");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedFlow(
    auth.supabase,
    auth.ctx.userId,
    flowId,
    auth.ctx.allowedFlowIds
  );
  if (!owned.ok) return owned.response;

  const { data: run, error } = await auth.supabase
    .from("flow_runs")
    .select("*, flow_run_steps(*)")
    .eq("id", runId)
    .eq("flow_id", flowId)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  }

  return NextResponse.json(run);
}
