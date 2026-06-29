"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Play,
  Check,
  History,
  Upload,
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
      .then((d) => setAgents(Array.isArray(d) ? d.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })) : []));
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
    }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/flows")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Flows
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-900">{name || "Flow"}</h2>
          <Badge tone={status === "published" ? "success" : "warning"}>{status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveVersion} disabled={saving}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar v+"}
          </Button>
          <Button onClick={executeFlow} disabled={running}>
            <Play size={16} />
            {running ? "A executar..." : "Executar"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1 space-y-4">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[80px]"
          />
          <Input
            label="Input de teste"
            hint="Texto enviado ao trigger na execução"
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
          />
          {runResult && (
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs font-medium text-emerald-700">Último resultado</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{runResult}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <FlowCanvas
            graph={graph}
            onChange={setGraph}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        <Card className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {selectedNode ? "Configurar nó" : "Selecione um nó"}
          </h3>
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              agents={agents}
              onChange={(patch) => updateNodeData(selectedNode.id, patch)}
            />
          )}

          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowRuns((s) => !s)}
              className="flex w-full items-center gap-2 text-sm font-medium text-slate-600"
            >
              <History size={16} />
              Histórico de execuções ({runs.length})
            </button>
            {showRuns && (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs"
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
                  <p className="text-xs text-slate-400">Sem execuções ainda.</p>
                )}
              </ul>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Versões</p>
            <ul className="mt-2 space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2"
                >
                  <span className="text-sm text-slate-700">
                    v{v.version}
                    {v.id === currentVersionId && (
                      <Badge tone="brand" className="ml-2">
                        atual
                      </Badge>
                    )}
                  </span>
                  {v.status !== "published" && (
                    <Button size="sm" variant="outline" onClick={() => publishVersion(v.id)}>
                      <Upload size={14} />
                      Publicar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function NodeConfigPanel({
  node,
  agents,
  onChange,
}: {
  node: FlowNode;
  agents: Array<{ id: string; name: string }>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const meta = FLOW_NODE_TYPES.find((n) => n.type === node.type);

  return (
    <div className="space-y-3">
      <Input
        label="Etiqueta"
        value={String(node.data.label ?? "")}
        onChange={(e) => onChange({ label: e.target.value })}
      />

      {node.type === "trigger" && (
        <Textarea
          label="Input padrão"
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
            hint="Use {{input}} para o output anterior"
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
        </>
      )}

      {node.type === "transform" && (
        <Textarea
          label="Template"
          hint="Use {{input}}"
          value={String(node.data.template ?? "{{input}}")}
          onChange={(e) => onChange({ template: e.target.value })}
        />
      )}

      {node.type === "output" && (
        <p className="text-xs text-slate-500">
          O nó output recolhe o resultado final do flow.
        </p>
      )}

      <p className="text-xs text-slate-400">{meta?.desc}</p>
    </div>
  );
}
