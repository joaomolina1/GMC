import type { FlowGraph } from "./types";

export interface ExampleFlowDefinition {
  name: string;
  description: string;
  category: "basico" | "codigo" | "condicao" | "agente";
  graph: FlowGraph;
  sampleInput?: string;
}

const AGENT_TESTE_ID = "4c08d48a-628f-49d8-8606-deb12fc04b05";

export const EXAMPLE_FLOWS: ExampleFlowDefinition[] = [
  {
    name: "Exemplo: Eco (Transformar)",
    description:
      "Categoria: básico. O Trigger passa texto ao nó Transformar, que acrescenta um prefixo, e o Output mostra o resultado.",
    category: "basico",
    sampleInput: "Olá GMC",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 60, y: 140 },
          data: { label: "Início", input: "Olá GMC" },
        },
        {
          id: "transform-1",
          type: "transform",
          position: { x: 300, y: 140 },
          data: { label: "Eco", template: "📢 Eco: {{input}}" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 540, y: 140 },
          data: { label: "Resultado" },
        },
      ],
      edges: [
        { id: "e-t-tr", source: "trigger-1", target: "transform-1" },
        { id: "e-tr-o", source: "transform-1", target: "output-1" },
      ],
    },
  },
  {
    name: "Exemplo: Contar palavras (Código)",
    description:
      "Categoria: código. JavaScript no nó Correr código — variável `input`, usar `return`. Teste com: «isto é um teste simples».",
    category: "codigo",
    sampleInput: "isto é um teste simples",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 60, y: 140 },
          data: { label: "Início", input: "" },
        },
        {
          id: "code-1",
          type: "code",
          position: { x: 300, y: 140 },
          data: {
            label: "Contar",
            language: "javascript",
            code: 'const n = input.trim().split(/\\s+/).filter(Boolean).length;\nreturn n + " palavra(s)";',
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 540, y: 140 },
          data: { label: "Resultado" },
        },
      ],
      edges: [
        { id: "e-t-c", source: "trigger-1", target: "code-1" },
        { id: "e-c-o", source: "code-1", target: "output-1" },
      ],
    },
  },
  {
    name: "Exemplo: Condição VIP",
    description:
      "Categoria: condição. Se o texto contém «vip», segue o ramo verde (verdadeiro); senão o ramo vermelho (falso). Teste com e sem a palavra vip.",
    category: "condicao",
    sampleInput: "cliente vip gold",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 60, y: 200 },
          data: { label: "Início", input: "" },
        },
        {
          id: "cond-1",
          type: "condition",
          position: { x: 260, y: 200 },
          data: { label: "É VIP?", operator: "contains", value: "vip" },
        },
        {
          id: "transform-yes",
          type: "transform",
          position: { x: 480, y: 80 },
          data: { label: "Ramo VIP", template: "⭐ VIP: {{input}}" },
        },
        {
          id: "transform-no",
          type: "transform",
          position: { x: 480, y: 320 },
          data: { label: "Ramo normal", template: "👤 Normal: {{input}}" },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 700, y: 200 },
          data: { label: "Resultado" },
        },
      ],
      edges: [
        { id: "e-t-c", source: "trigger-1", target: "cond-1" },
        { id: "e-c-yes", source: "cond-1", target: "transform-yes", data: { branch: "true" } },
        { id: "e-c-no", source: "cond-1", target: "transform-no", data: { branch: "false" } },
        { id: "e-yes-o", source: "transform-yes", target: "output-1" },
        { id: "e-no-o", source: "transform-no", target: "output-1" },
      ],
    },
  },
  {
    name: "Exemplo: Agente resumo",
    description:
      "Categoria: agente. Chama o agente «Agente teste» para resumir o texto do Trigger numa frase.",
    category: "agente",
    sampleInput:
      "A Media Capital é um grupo de media português com rádio, televisão e digital.",
    graph: {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 60, y: 140 },
          data: { label: "Início", input: "" },
        },
        {
          id: "agent-1",
          type: "agent",
          position: { x: 300, y: 140 },
          data: {
            label: "Resumir",
            agentId: AGENT_TESTE_ID,
            prompt: "Resume numa única frase curta em português:\n\n{{input}}",
          },
        },
        {
          id: "output-1",
          type: "output",
          position: { x: 540, y: 140 },
          data: { label: "Resultado" },
        },
      ],
      edges: [
        { id: "e-t-a", source: "trigger-1", target: "agent-1" },
        { id: "e-a-o", source: "agent-1", target: "output-1" },
      ],
    },
  },
];
