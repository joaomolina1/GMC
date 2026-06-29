export type FlowNodeType = "trigger" | "agent" | "condition" | "transform" | "output";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  data?: { branch?: "true" | "false" };
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowRunInput {
  text?: string;
  variables?: Record<string, unknown>;
}

export interface FlowStepResult {
  nodeId: string;
  nodeType: FlowNodeType;
  status: "completed" | "failed" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

export interface FlowRunResult {
  status: "completed" | "failed";
  output: string;
  steps: FlowStepResult[];
  error?: string;
}

export interface FlowRunContext {
  userId: string;
  flowId: string;
  runId: string;
  supabase: import("@supabase/supabase-js").SupabaseClient;
  input: FlowRunInput;
}
