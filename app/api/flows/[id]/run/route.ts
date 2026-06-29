import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";
import { runFlow } from "@lib/flows/server";
import type { FlowGraph } from "@lib/flows/types";
import { assertQuotaAvailable } from "@lib/enterprise/quotas";
import { assertRateLimit } from "@lib/enterprise/rate-limit";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = await assertRateLimit(supabase, "/api/flows/run", user.id);
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const quotaCheck = await assertQuotaAvailable(supabase, user.id);
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.message }, { status: 402 });
  }

  const body = await request.json().catch(() => ({}));
  const inputText = body.input as string | undefined;

  const { data: flow } = await supabase
    .from("flows")
    .select("*, flow_versions!flow_versions_flow_id_fkey(*)")
    .eq("id", flowId)
    .single();

  if (!flow) return NextResponse.json({ error: "Flow não encontrado" }, { status: 404 });

  const version =
    flow.flow_versions?.find(
      (v: { id: string }) => v.id === flow.current_version_id
    ) ?? flow.flow_versions?.[0];

  if (!version) {
    return NextResponse.json({ error: "Versão do flow não encontrada" }, { status: 400 });
  }

  const { data: run, error: runError } = await supabase
    .from("flow_runs")
    .insert({
      flow_id: flowId,
      flow_version_id: version.id,
      user_id: user.id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message ?? "Falha ao criar run" }, { status: 500 });
  }

  const graph = version.graph as FlowGraph;

  const result = await runFlow(graph, {
    userId: user.id,
    flowId,
    runId: run.id,
    supabase,
    input: { text: inputText },
  });

  for (const step of result.steps) {
    await supabase.from("flow_run_steps").insert({
      run_id: run.id,
      node_id: step.nodeId,
      status: step.status === "skipped" ? "completed" : step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  await supabase
    .from("flow_runs")
    .update({
      status: result.status === "completed" ? "completed" : "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await logAudit(supabase, {
    actorId: user.id,
    action: "flow.run",
    entityType: "flow_run",
    entityId: run.id,
    metadata: { flowId, status: result.status },
  });

  return NextResponse.json({
    runId: run.id,
    status: result.status,
    output: result.output,
    steps: result.steps,
    error: result.error,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("flow_runs")
    .select("*")
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
