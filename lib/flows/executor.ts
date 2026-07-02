import { runAgent } from "@lib/chat/agent";
import { buildAgentRuntimeConfig, persistAgentGeneratedFiles } from "@lib/agents/runtime";
import { executeFlowCode } from "./code-runner";
import type {
  FlowGraph,
  FlowNode,
  FlowRunCallbacks,
  FlowRunContext,
  FlowRunResult,
  FlowStepResult,
} from "./types";

/** Max nodes executed concurrently within the same dependency level. */
const MAX_PARALLEL_NODES = 4;

const MULTI_INPUT_SEPARATOR = "\n\n---\n\n";

function topologicalOrder(graph: FlowGraph): FlowNode[] | { cycle: true; nodeIds: string[] } {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = graph.nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const order: FlowNode[] = [];
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) order.push(node);

    for (const next of adj.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== graph.nodes.length) {
    const visited = new Set(order.map((n) => n.id));
    const cycleNodeIds = graph.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
    return { cycle: true, nodeIds: cycleNodeIds };
  }

  return order;
}

/** Group nodes by dependency depth for parallel execution of independent branches. */
function executionLevels(graph: FlowGraph): FlowNode[][] | { error: string } {
  const orderResult = topologicalOrder(graph);
  if ("cycle" in orderResult) {
    const ids = orderResult.nodeIds.slice(0, 3).join(", ");
    const suffix = orderResult.nodeIds.length > 3 ? "…" : "";
    return {
      error: `O flow contém um ciclo (nós: ${ids}${suffix}). Remova as ligações circulares.`,
    };
  }

  const order = orderResult;
  const level = new Map<string, number>();

  for (const node of order) {
    const incoming = graph.edges.filter((e) => e.target === node.id);
    if (incoming.length === 0) {
      level.set(node.id, 0);
    } else {
      const maxPred = Math.max(...incoming.map((e) => level.get(e.source) ?? 0));
      level.set(node.id, maxPred + 1);
    }
  }

  const byLevel = new Map<number, FlowNode[]>();
  for (const node of order) {
    const l = level.get(node.id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(node);
  }

  return Array.from(byLevel.entries())
    .sort(([a], [b]) => a - b)
    .map(([, nodes]) => nodes);
}

function getOutgoingEdges(graph: FlowGraph, nodeId: string) {
  return graph.edges.filter((e) => e.source === nodeId);
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function isEdgeActive(
  edge: FlowGraph["edges"][number],
  graph: FlowGraph,
  state: Record<string, unknown>,
  skippedNodeIds: Set<string>
): boolean {
  const source = graph.nodes.find((n) => n.id === edge.source);
  if (!source || skippedNodeIds.has(source.id)) return false;

  if (source.type === "condition") {
    const branch = state[`__branch_${source.id}`] as string | undefined;
    if (branch && edge.data?.branch && edge.data.branch !== branch) {
      return false;
    }
  }

  return true;
}

function shouldSkipNode(
  node: FlowNode,
  graph: FlowGraph,
  state: Record<string, unknown>,
  skippedNodeIds: Set<string>
): boolean {
  if (node.type === "trigger") return false;

  const incoming = graph.edges.filter((e) => e.target === node.id);
  if (incoming.length === 0) return true;

  return !incoming.some((edge) => isEdgeActive(edge, graph, state, skippedNodeIds));
}

/** Resolve input text from active predecessor edges (join when multiple). */
function resolveNodeInput(
  node: FlowNode,
  graph: FlowGraph,
  outputs: Map<string, string>,
  variables: Record<string, unknown>,
  skippedNodeIds: Set<string>
): string {
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const activeSources = incoming
    .filter((e) => isEdgeActive(e, graph, variables, skippedNodeIds))
    .map((e) => e.source)
    .filter((id) => outputs.has(id));

  if (activeSources.length === 0) return "";

  const texts = activeSources.map((id) => outputs.get(id) ?? "");
  if (texts.length === 1) return texts[0]!;
  return texts.join(MULTI_INPUT_SEPARATOR);
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function executeNode(
  node: FlowNode,
  graph: FlowGraph,
  ctx: FlowRunContext,
  nodeInput: string,
  variables: Record<string, unknown>
): Promise<FlowStepResult> {
  const input = { nodeInput, variables: { ...variables } };

  try {
    switch (node.type) {
      case "trigger": {
        const text =
          ctx.input.text ||
          String(node.data.input ?? "") ||
          "Executar flow";
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { text },
        };
      }

      case "agent": {
        const agentId = String(node.data.agentId ?? "");
        if (!agentId) throw new Error("Agente não configurado");

        const { data: agent } = await ctx.supabase
          .from("agents")
          .select("id, current_version_id")
          .eq("id", agentId)
          .single();

        if (!agent) throw new Error("Agente não encontrado");
        if (!agent.current_version_id) {
          throw new Error("Agente sem versão guardada — abra o Builder e guarde o agente primeiro");
        }

        const { data: version } = await ctx.supabase
          .from("agent_versions")
          .select("*")
          .eq("id", agent.current_version_id)
          .single();

        if (!version) throw new Error("Versão do agente não encontrada");

        const prompt = interpolate(String(node.data.prompt ?? "{{input}}"), {
          input: nodeInput,
        });

        const runtimeConfig = await buildAgentRuntimeConfig({
          supabase: ctx.supabase,
          agentId,
          version,
          userMessage: prompt,
          userId: ctx.userId,
        });

        const result = await runAgent(runtimeConfig, [{ role: "user", content: prompt }]);

        let generatedFiles: Awaited<ReturnType<typeof persistAgentGeneratedFiles>> = [];
        if (result.anthropicFileIds?.length) {
          generatedFiles = await persistAgentGeneratedFiles({
            fileIds: result.anthropicFileIds,
            userId: ctx.userId,
            supabase: ctx.supabase,
          });
        }

        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input: { ...input, prompt, agentId },
          output: {
            text: result.content,
            costEur: result.costEur,
            files: generatedFiles,
            tool_calls: result.toolCalls ?? [],
            steps_used: result.stepsUsed,
          },
        };
      }

      case "condition": {
        const operator = String(node.data.operator ?? "contains");
        const value = String(node.data.value ?? "");
        const haystack = nodeInput.toLowerCase();
        const needle = value.toLowerCase();

        let matched = false;
        if (operator === "contains") matched = haystack.includes(needle);
        else if (operator === "equals") matched = haystack === needle;
        else if (operator === "not_empty") matched = nodeInput.trim().length > 0;

        const edges = getOutgoingEdges(graph, node.id);
        const branch = matched ? "true" : "false";
        const activeEdge = edges.find((e) => e.data?.branch === branch) ?? edges[0];

        variables[`__branch_${node.id}`] = branch;

        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { matched, branch, nextNode: activeEdge?.target, text: nodeInput },
        };
      }

      case "transform": {
        const template = String(node.data.template ?? "{{input}}");
        const text = interpolate(template, { input: nodeInput });
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { text },
        };
      }

      case "code": {
        const language = String(node.data.language ?? "javascript") as
          | "javascript"
          | "python";
        const code = String(node.data.code ?? "return input;");
        const text = await executeFlowCode(language, code, nodeInput);
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input: { ...input, language },
          output: { text },
        };
      }

      case "output": {
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { text: nodeInput },
        };
      }

      default:
        throw new Error(`Tipo de nó desconhecido: ${node.type}`);
    }
  } catch (err) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      input,
      output: {},
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

function storeNodeOutput(step: FlowStepResult, outputs: Map<string, string>) {
  if (step.status !== "completed") return;
  const text = step.output.text;
  if (typeof text === "string") {
    outputs.set(step.nodeId, text);
  }
}

export async function runFlow(
  graph: FlowGraph,
  ctx: FlowRunContext,
  callbacks?: FlowRunCallbacks
): Promise<FlowRunResult> {
  const levelsResult = executionLevels(graph);
  if ("error" in levelsResult) {
    return { status: "failed", output: "", steps: [], error: levelsResult.error };
  }

  const levels = levelsResult;
  const steps: FlowStepResult[] = [];
  const outputs = new Map<string, string>();
  const variables = { ...(ctx.input.variables ?? {}) } as Record<string, unknown>;
  const skippedNodeIds = new Set<string>();

  for (const levelNodes of levels) {
    const runnable = levelNodes.filter(
      (node) => !shouldSkipNode(node, graph, variables, skippedNodeIds)
    );
    const skippedInLevel = levelNodes.filter((node) =>
      shouldSkipNode(node, graph, variables, skippedNodeIds)
    );

    for (const node of skippedInLevel) {
      skippedNodeIds.add(node.id);
      const skipped: FlowStepResult = {
        nodeId: node.id,
        nodeType: node.type,
        status: "skipped",
        input: {},
        output: {},
      };
      steps.push(skipped);
      callbacks?.onStepComplete?.(skipped);
    }

    if (runnable.length === 0) continue;

    const executeOne = async (node: FlowNode) => {
      callbacks?.onStepStart?.(node.id, node.type);
      const nodeInput = resolveNodeInput(node, graph, outputs, variables, skippedNodeIds);
      const step = await executeNode(node, graph, ctx, nodeInput, variables);
      return step;
    };

    if (runnable.length === 1) {
      const step = await executeOne(runnable[0]!);
      steps.push(step);
      callbacks?.onStepComplete?.(step);
      storeNodeOutput(step, outputs);
      if (step.status === "failed") {
        return { status: "failed", output: fallbackOutput(outputs, steps), steps, error: step.error };
      }
      continue;
    }

    const parallelResults = await runWithConcurrencyLimit(
      runnable,
      MAX_PARALLEL_NODES,
      executeOne
    );

    for (const step of parallelResults) {
      steps.push(step);
      callbacks?.onStepComplete?.(step);
      storeNodeOutput(step, outputs);
      if (step.status === "failed") {
        return { status: "failed", output: fallbackOutput(outputs, steps), steps, error: step.error };
      }
    }
  }

  const outputTexts = steps
    .filter((s) => s.nodeType === "output" && s.status === "completed")
    .map((s) => String(s.output.text ?? ""));

  const finalText =
    outputTexts.length > 0
      ? outputTexts.join(MULTI_INPUT_SEPARATOR)
      : fallbackOutput(outputs, steps);

  return {
    status: "completed",
    output: finalText,
    steps,
  };
}

function fallbackOutput(outputs: Map<string, string>, steps: FlowStepResult[]): string {
  const lastCompleted = [...steps]
    .reverse()
    .find((s) => s.status === "completed" && typeof s.output.text === "string");
  if (lastCompleted) return String(lastCompleted.output.text);
  const last = [...outputs.values()].pop();
  return last ?? "";
}
