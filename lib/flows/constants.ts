import type { FlowNodeType } from "./types";

export const FLOW_NODE_TYPES: {
  type: FlowNodeType;
  label: string;
  desc: string;
  tone: string;
  defaultData: Record<string, unknown>;
}[] = [
  {
    type: "trigger",
    label: "Trigger",
    desc: "Ponto de entrada do flow",
    tone: "bg-emerald-50 text-emerald-600 border-emerald-200",
    defaultData: { label: "Início", input: "" },
  },
  {
    type: "agent",
    label: "Agente",
    desc: "Executa um agente de IA",
    tone: "bg-brand-50 text-brand-600 border-brand-200",
    defaultData: { label: "Agente", agentId: "", prompt: "{{input}}" },
  },
  {
    type: "condition",
    label: "Condição",
    desc: "Ramifica com base no texto",
    tone: "bg-amber-50 text-amber-600 border-amber-200",
    defaultData: { label: "Condição", operator: "contains", value: "" },
  },
  {
    type: "transform",
    label: "Transformar",
    desc: "Reformata o texto anterior com um template (variável {{input}})",
    tone: "bg-violet-50 text-violet-600 border-violet-200",
    defaultData: { label: "Transformar", template: "{{input}}" },
  },
  {
    type: "code",
    label: "Correr código",
    desc: "Executa JavaScript ou Python sobre o output anterior",
    tone: "bg-orange-50 text-orange-600 border-orange-200",
    defaultData: {
      label: "Código",
      language: "javascript",
      code: "// `input` contém o texto do nó anterior\nreturn input;",
    },
  },
  {
    type: "output",
    label: "Output",
    desc: "Resultado final do flow",
    tone: "bg-slate-100 text-slate-600 border-slate-200",
    defaultData: { label: "Resultado" },
  },
];

export const DEFAULT_FLOW_GRAPH = {
  nodes: [
    {
      id: "trigger-1",
      type: "trigger" as const,
      position: { x: 60, y: 140 },
      data: { label: "Início", input: "" },
    },
    {
      id: "output-1",
      type: "output" as const,
      position: { x: 420, y: 140 },
      data: { label: "Resultado" },
    },
  ],
  edges: [{ id: "e-trigger-output", source: "trigger-1", target: "output-1" }],
};
