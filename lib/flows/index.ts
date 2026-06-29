/** Flow Engine — Phase 5 placeholder */
export interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export async function runFlow(_graph: FlowGraph): Promise<{ status: string }> {
  return { status: "not_implemented" };
}
