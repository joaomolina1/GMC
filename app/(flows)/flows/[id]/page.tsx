"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Play,
  Check,
  History,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { FlowCanvas } from "@/_components/FlowCanvas";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";
import type { FlowGraph, FlowNode } from "@lib/flows/types";

interface FlowVersion {
  id: string;
  version: number;
  graph: FlowGraph;
  status: string;
}

interface FlowRun {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default function FlowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [graph, setGraph] = useState<FlowGraph>({ nodes: [], edges: [] });
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [runInput, setRunInput] = useState("");
  const [runResult, setRunResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [showRuns, setShowRuns] = useState(searchParams.get("run") === "1");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const loadFlow = useCallback(async () => {
    const res = await fetch(`/api/flows/${id}`);
    const data = await res.json();
    if (!res.ok || !data?.id) return;

    setName(data.name ?? "");
    setDescription(data.description ?? "");
    setStatus(data.status ?? "draft");
    setVersions(data.flow_versions ?? []);
    setCurrentVersionId(data.current_version_id);

    const current =
      data.flow_versions?.find((v: FlowVersion) => v.id === data.current_version_id) ??
      data.flow_versions?.[0];
    if (current?.graph) {
      setGraph(current.graph as FlowGraph);
    }
  }, [id]);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/flows/${id}/run`);
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
  }, [id]);

  useEffect(() => {
    loadFlow();
    loadRuns();
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) =>
        setAgents(
          Array.isArray(d)
            ? d.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
            : []
        )
      );
  }, [id, loadFlow, loadRuns]);

  function updateNodeData(nodeId: string, patch: Record<string, unknown>) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    }));
  }

  async function saveVersion() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/flows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const res = await fetch(`/api/flows/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph }),
    });
    if (res.ok) {
      await loadFlow();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  async function publishVersion(versionId: string) {
    await fetch(`/api/flows/${id}/versions/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    await loadFlow();
  }

  async function executeFlow() {
    setRunning(true);
    setRunResult(null);
    const res = await fetch(`/api/flows/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: runInput }),
    });
    const data = await res.json();
    if (res.ok) {
      setRunResult(data.output ?? data.error ?? "Sem output");
      setShowRuns(true);
      await loadRuns();
    } else {
      setRunResult(data.error ?? "Erro na execução");
    }
    setRunning(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push("/flows")}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Flows
          </button>
          <h2 className="truncate text-base font-semibold text-slate-900">
            {name || "Flow"}
          </h2>
          <Badge tone={status === "published" ? "success" : "warning"}>{status}</Badge>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={saveVersion} disabled={saving}>
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar v+"}
          </Button>
          <Button size="sm" onClick={executeFlow} disabled={running}>
            <Play size={14} />
            {running ? "A executar..." : "Executar"}
          </Button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside
          className={`flex shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 ${
            leftOpen ? "w-64" : "w-10"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
            {leftOpen && (
              <span className="px-1 text-xs font-semibold text-slate-600">Flow</span>
            )}
            <button
              type="button"
              onClick={() => setLeftOpen((o) => !o)}
              className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"
              title={leftOpen ? "Ocultar painel" : "Mostrar painel"}
            >
              {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          </div>
          {leftOpen && (
            <div className="space-y-3 overflow-y-auto p-3">
              <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea
                label="Descrição"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px]"
              />
              <Input
                label="Input de teste"
                hint="Texto para o nó Trigger"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
              />
              {runResult && (
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="text-[10px] font-semibold text-emerald-700">Resultado</p>
                  <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-emerald-900">
                    {runResult}
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Canvas — takes all remaining space */}
        <div className="min-w-0 flex-1 p-2">
          <FlowCanvas
            graph={graph}
            onChange={setGraph}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        {/* Right panel */}
        <aside
          className={`flex shrink-0 flex-col border-l border-line bg-white transition-[width] duration-200 ${
            rightOpen ? "w-80" : "w-10"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
            <button
              type="button"
              onClick={() => setRightOpen((o) => !o)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
              title={rightOpen ? "Ocultar painel" : "Mostrar painel"}
            >
              {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
            {rightOpen && (
              <span className="px-1 text-xs font-semibold text-slate-600">Propriedades</span>
            )}
          </div>
          {rightOpen && (
            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              <NodeConfigPanel
                node={selectedNode}
                agents={agents}
                onChange={(patch) =>
                  selectedNode && updateNodeData(selectedNode.id, patch)
                }
              />

              <div className="border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => setShowRuns((s) => !s)}
                  className="flex w-full items-center gap-2 text-xs font-medium text-slate-600"
                >
                  <History size={14} />
                  Execuções ({runs.length})
                </button>
                {showRuns && (
                  <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                    {runs.map((run) => (
                      <li
                        key={run.id}
                        className="flex items-center justify-between rounded border border-line px-2 py-1.5 text-[10px]"
                      >
                        <span className="text-slate-500">
                          {new Date(run.created_at).toLocaleString("pt-PT")}
                        </span>
                        <Badge
                          tone={
                            run.status === "completed"
                              ? "success"
                              : run.status === "failed"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {run.status}
                        </Badge>
                      </li>
                    ))}
                    {runs.length === 0 && (
                      <p className="text-[10px] text-slate-400">Sem execuções.</p>
                    )}
                  </ul>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Versões</p>
                <ul className="mt-2 space-y-1.5">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between rounded border border-line px-2 py-1.5"
                    >
                      <span className="text-xs text-slate-700">
                        v{v.version}
                        {v.id === currentVersionId && (
                          <Badge tone="brand" className="ml-1.5">
                            atual
                          </Badge>
                        )}
                      </span>
                      {v.status !== "published" && (
                        <Button size="sm" variant="outline" onClick={() => publishVersion(v.id)}>
                          <Upload size={12} />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeConfigPanel({
  node,
  agents,
  onChange,
}: {
  node: FlowNode | null;
  agents: Array<{ id: string; name: string }>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  if (!node) {
    return (
      <p className="text-xs text-slate-400">
        Selecione um nó no canvas para configurar. Ligue nós arrastando das bolinhas azuis
        (saída) para as cinzentas (entrada).
      </p>
    );
  }

  const meta = FLOW_NODE_TYPES.find((n) => n.type === node.type);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-800">{meta?.label}</p>
        <p className="text-[10px] text-slate-400">{meta?.desc}</p>
      </div>

      <Input
        label="Etiqueta"
        value={String(node.data.label ?? "")}
        onChange={(e) => onChange({ label: e.target.value })}
      />

      {node.type === "trigger" && (
        <Textarea
          label="Input padrão"
          hint="Usado se não enviar input no teste"
          value={String(node.data.input ?? "")}
          onChange={(e) => onChange({ input: e.target.value })}
        />
      )}

      {node.type === "agent" && (
        <>
          <Select
            label="Agente"
            value={String(node.data.agentId ?? "")}
            onChange={(e) => onChange({ agentId: e.target.value })}
          >
            <option value="">Selecionar agente...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Textarea
            label="Prompt"
            hint="Use {{input}} para o texto do nó anterior"
            value={String(node.data.prompt ?? "{{input}}")}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
        </>
      )}

      {node.type === "condition" && (
        <>
          <Select
            label="Operador"
            value={String(node.data.operator ?? "contains")}
            onChange={(e) => onChange({ operator: e.target.value })}
          >
            <option value="contains">Contém</option>
            <option value="equals">Igual a</option>
            <option value="not_empty">Não vazio</option>
          </Select>
          <Input
            label="Valor"
            value={String(node.data.value ?? "")}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          <p className="rounded-lg bg-amber-50 p-2 text-[10px] text-amber-800">
            Ligue a saída <strong>verde</strong> (verdadeiro) e <strong>vermelha</strong> (falso)
            aos nós seguintes.
          </p>
        </>
      )}

      {node.type === "transform" && (
        <>
          <Textarea
            label="Template de texto"
            value={String(node.data.template ?? "{{input}}")}
            onChange={(e) => onChange({ template: e.target.value })}
            className="min-h-[100px] font-mono text-xs"
          />
          <div className="rounded-lg bg-violet-50 p-2.5 text-[10px] leading-relaxed text-violet-900">
            <p className="font-semibold">Como funciona o Transformar</p>
            <p className="mt-1">
              Substitui <code className="rounded bg-white/60 px-1">{"{{input}}"}</code> pelo texto
              produzido pelo nó anterior e passa o resultado ao próximo nó.
            </p>
            <p className="mt-2 font-medium">Exemplos:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                <code className="font-mono">Resumo: {"{{input}}"}</code>
              </li>
              <li>
                <code className="font-mono">{"{{input}}".toUpperCase()}</code> — não funciona; é
                texto literal, não código
              </li>
              <li>
                Para lógica use o nó <strong>Correr código</strong>
              </li>
            </ul>
          </div>
        </>
      )}

      {node.type === "code" && (
        <>
          <Select
            label="Linguagem"
            value={String(node.data.language ?? "javascript")}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python 3</option>
          </Select>
          <Textarea
            label="Código"
            hint="Variável `input` = texto do nó anterior. Use return (JS) ou print (Python)."
            value={String(node.data.code ?? "")}
            onChange={(e) => onChange({ code: e.target.value })}
            className="min-h-[160px] font-mono text-xs"
          />
          <div className="rounded-lg bg-orange-50 p-2.5 text-[10px] text-orange-900">
            <p className="font-semibold">Exemplo JavaScript</p>
            <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-1.5 font-mono">
              {`return input.split(" ").length + " palavras";`}
            </pre>
            <p className="mt-2 font-semibold">Exemplo Python</p>
            <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-1.5 font-mono">
              {`print(len(input.split()))`}
            </pre>
          </div>
        </>
      )}

      {node.type === "output" && (
        <p className="text-[10px] text-slate-500">
          Recolhe o resultado final do flow. Deve ser o último nó da cadeia.
        </p>
      )}
    </div>
  );
}
