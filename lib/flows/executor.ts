import { runAgentLoop } from "@lib/skills/runner";
import type {
  FlowGraph,
  FlowNode,
  FlowRunContext,
  FlowRunResult,
  FlowStepResult,
} from "./types";

function topologicalOrder(graph: FlowGraph): FlowNode[] {
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

  return order.length === graph.nodes.length ? order : graph.nodes;
}

function getOutgoingEdges(graph: FlowGraph, nodeId: string) {
  return graph.edges.filter((e) => e.source === nodeId);
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

async function executeNode(
  node: FlowNode,
  graph: FlowGraph,
  ctx: FlowRunContext,
  state: { lastOutput: string; variables: Record<string, unknown> }
): Promise<FlowStepResult> {
  const input = { lastOutput: state.lastOutput, variables: state.variables };

  try {
    switch (node.type) {
      case "trigger": {
        const text =
          ctx.input.text ||
          String(node.data.input ?? "") ||
          "Executar flow";
        state.lastOutput = text;
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
          .select("*, agent_versions!agent_versions_agent_id_fkey(*)")
          .eq("id", agentId)
          .single();

        if (!agent) throw new Error("Agente não encontrado");

        const version =
          agent.agent_versions?.find(
            (v: { id: string }) => v.id === agent.current_version_id
          ) ?? agent.agent_versions?.[0];

        if (!version) throw new Error("Versão do agente não encontrada");

        const prompt = interpolate(String(node.data.prompt ?? "{{input}}"), {
          input: state.lastOutput,
        });

        const skills = (version.skills as string[]) ?? [];
        const skillConfigs =
          (version.tools as Record<string, Record<string, unknown>>) ?? {};

        const result = await runAgentLoop({
          config: {
            model: version.model,
            systemPrompt: version.system_prompt,
            temperature: Number(version.temperature),
            skills,
            skillConfigs,
          },
          messages: [{ role: "user", content: prompt }],
          ctx: {
            userId: ctx.userId,
            agentId,
            supabase: ctx.supabase,
          },
        });

        state.lastOutput = result.content;
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input: { ...input, prompt, agentId },
          output: { text: result.content, costEur: result.costEur },
        };
      }

      case "condition": {
        const operator = String(node.data.operator ?? "contains");
        const value = String(node.data.value ?? "");
        const haystack = state.lastOutput.toLowerCase();
        const needle = value.toLowerCase();

        let matched = false;
        if (operator === "contains") matched = haystack.includes(needle);
        else if (operator === "equals") matched = haystack === needle;
        else if (operator === "not_empty") matched = state.lastOutput.trim().length > 0;

        const edges = getOutgoingEdges(graph, node.id);
        const branch = matched ? "true" : "false";
        const activeEdge = edges.find((e) => e.data?.branch === branch) ?? edges[0];

        state.variables[`__branch_${node.id}`] = branch;

        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { matched, branch, nextNode: activeEdge?.target },
        };
      }

      case "transform": {
        const template = String(node.data.template ?? "{{input}}");
        const text = interpolate(template, { input: state.lastOutput });
        state.lastOutput = text;
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { text },
        };
      }

      case "output": {
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: "completed",
          input,
          output: { text: state.lastOutput },
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

function shouldSkipNode(node: FlowNode, graph: FlowGraph, state: Record<string, unknown>): boolean {
  if (node.type === "trigger") return false;

  const incoming = graph.edges.filter((e) => e.target === node.id);
  if (incoming.length === 0) return true;

  for (const edge of incoming) {
    const source = graph.nodes.find((n) => n.id === edge.source);
    if (source?.type === "condition") {
      const branch = state[`__branch_${source.id}`] as string | undefined;
      if (branch && edge.data?.branch && edge.data.branch !== branch) {
        return true;
      }
    }
  }
  return false;
}

export async function runFlow(
  graph: FlowGraph,
  ctx: FlowRunContext
): Promise<FlowRunResult> {
  const order = topologicalOrder(graph);
  const steps: FlowStepResult[] = [];
  const state = {
    lastOutput: "",
    variables: { ...(ctx.input.variables ?? {}) } as Record<string, unknown>,
  };

  for (const node of order) {
    if (shouldSkipNode(node, graph, state.variables)) {
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        status: "skipped",
        input: {},
        output: {},
      });
      continue;
    }

    const step = await executeNode(node, graph, ctx, state);
    steps.push(step);

    if (step.status === "failed") {
      return {
        status: "failed",
        output: state.lastOutput,
        steps,
        error: step.error,
      };
    }
  }

  const outputNode = steps.find((s) => s.nodeType === "output" && s.status === "completed");
  const finalText =
    (outputNode?.output.text as string) ?? state.lastOutput;

  return {
    status: "completed",
    output: finalText,
    steps,
  };
}
