import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@lib/audit";
import { runFlow } from "@lib/flows/server";
import type { FlowGraph, FlowStepResult } from "@lib/flows/types";
import { normalizeApiInput } from "@lib/agents/execute-agent";

async function persistSteps(
  supabase: SupabaseClient,
  runId: string,
  steps: FlowStepResult[]
) {
  for (const step of steps) {
    await supabase.from("flow_run_steps").insert({
      run_id: runId,
      node_id: step.nodeId,
      status: step.status === "skipped" ? "completed" : step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }
}

export interface RunFlowApiOptions {
  supabase: SupabaseClient;
  userId: string;
  flowId: string;
  input: unknown;
  apiKeyId?: string;
}

export async function runFlowViaApi(options: RunFlowApiOptions) {
  const { supabase, userId, flowId, input, apiKeyId } = options;
  const inputText = normalizeApiInput(input);

  const { data: flow } = await supabase
    .from("flows")
    .select("*, flow_versions!flow_versions_flow_id_fkey(*)")
    .eq("id", flowId)
    .single();

  if (!flow) throw new Error("Flow não encontrado");

  const version =
    flow.flow_versions?.find((v: { id: string }) => v.id === flow.current_version_id) ??
    flow.flow_versions?.[0];

  if (!version) throw new Error("Versão do flow não encontrada");

  const { data: run, error: runError } = await supabase
    .from("flow_runs")
    .insert({
      flow_id: flowId,
      flow_version_id: version.id,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? "Falha ao criar execução");
  }

  const graph = version.graph as FlowGraph;
  const result = await runFlow(graph, {
    userId,
    flowId,
    runId: run.id,
    supabase,
    input: { text: inputText },
  });

  await persistSteps(supabase, run.id, result.steps);

  await supabase
    .from("flow_runs")
    .update({
      status: result.status === "completed" ? "completed" : "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await logAudit(supabase, {
    actorId: userId,
    action: "api.flow.run",
    entityType: "flow_run",
    entityId: run.id,
    metadata: { flowId, status: result.status, apiKeyId, source: "api_v1" },
  });

  return {
    run_id: run.id,
    status: result.status,
    output: result.output,
    steps: result.steps,
    error: result.error ?? null,
  };
}
