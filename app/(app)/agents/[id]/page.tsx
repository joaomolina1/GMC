"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save,
  Upload,
  ArrowLeft,
  Check,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { AgentChatPanel } from "@/_components/AgentChatPanel";
import { cn } from "@lib/utils";
import type { EffortLevel } from "@lib/ai/types";
import { modelSupportsThinking } from "@lib/ai/anthropic-params";
import { MARKETPLACE_CATEGORIES } from "@lib/marketplace/constants";

type Tab = "general" | "knowledge" | "versions";

interface AgentVersion {
  id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature?: number;
  effort?: EffortLevel;
  thinking_enabled?: boolean;
  status: string;
  published_at: string | null;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  visibility: string;
  status: string;
  current_version_id: string;
  agent_versions: AgentVersion[];
}

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "Geral" },
  { id: "knowledge", label: "Knowledge" },
  { id: "versions", label: "Versões" },
];

const docTone: Record<string, "success" | "warning" | "danger"> = {
  ready: "success",
  error: "danger",
};

export default function AgentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [category, setCategory] = useState("geral");
  const [tagsInput, setTagsInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; display_name: string; status?: string }>
  >([]);
  const [effort, setEffort] = useState<EffortLevel>("medium");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [docs, setDocs] = useState<
    Array<{
      id: string;
      filename: string;
      status: string;
      metadata?: {
        ocr_used?: boolean;
        char_count?: number;
        chunk_count?: number;
        embedding_model?: string;
        error?: string;
      };
    }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [docAction, setDocAction] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);
  const [knowledgeReady, setKnowledgeReady] = useState<boolean | null>(null);

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/knowledge/upload?agentId=${id}`);
    const d = await res.json();
    setDocs(Array.isArray(d) ? d : []);
  }, [id]);

  const loadAgent = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}`);
    const data = await res.json();
    if (!res.ok || !data?.id) return;
    setAgent(data);
    setName(data.name ?? "");
    setDescription(data.description ?? "");
    setVisibility(data.visibility ?? "private");
    setCategory(data.category ?? "geral");
    setTagsInput((data.tags ?? []).join(", "));
    const current =
      data.agent_versions?.find((v: AgentVersion) => v.id === data.current_version_id) ??
      data.agent_versions?.[0];
    if (current) {
      setSystemPrompt(current.system_prompt);
      setModel(current.model);
      setEffort((current.effort as EffortLevel) ?? "medium");
      setThinkingEnabled(Boolean(current.thinking_enabled));
      setActiveVersion(current.version);
    }
    setVersions(data.agent_versions ?? []);
  }, [id]);

  useEffect(() => {
    loadAgent();
    loadDocs();
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setKnowledgeReady(Boolean(h.serviceRole)))
      .catch(() => setKnowledgeReady(null));
  }, [id, loadAgent, loadDocs]);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableModels(
            data.map((m: { id: string; display_name: string; status?: string }) => ({
              id: m.id,
              display_name: m.display_name,
              status: m.status,
            }))
          );
        }
      });
  }, []);

  async function saveNewVersion() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const versionRes = await fetch(`/api/agents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        model,
        effort,
        thinking_enabled: thinkingEnabled,
      }),
    });
    if (!versionRes.ok) {
      const err = await versionRes.json().catch(() => ({}));
      setSaveError((err as { error?: string }).error ?? "Falha ao guardar versão");
      setSaving(false);
      return;
    }

    const savedVersion = (await versionRes.json()) as AgentVersion;

    const patchRes = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        visibility,
        category,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      setSaveError((err as { error?: string }).error ?? "Falha ao atualizar agente");
      setSaving(false);
      return;
    }

    const patchedAgent = (await patchRes.json()) as Agent;

    setAgent((prev) =>
      prev
        ? {
            ...prev,
            ...patchedAgent,
            current_version_id: savedVersion.id,
            status: "published",
          }
        : prev
    );
    setVersions((prev) => {
      const idx = prev.findIndex((v) => v.id === savedVersion.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedVersion;
        return next;
      }
      return [savedVersion, ...prev];
    });
    setActiveVersion(savedVersion.version);
    setSavedAt(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function publishVersion(versionId: string) {
    await fetch(`/api/agents/${id}/versions/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    await loadAgent();
  }

  async function rollbackVersion(versionId: string) {
    await fetch(`/api/agents/${id}/versions/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rollback" }),
    });
    await loadAgent();
  }

  async function uploadKnowledge(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocAction("upload");
    setDocError(null);
    setDocSuccess(null);
    const form = new FormData();
    form.append("file", file);
    form.append("agentId", id);
    try {
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDocError(data.error ?? `Upload falhou (${res.status})`);
      } else {
        setDocSuccess(`${file.name} indexado (${data.metadata?.chunk_count ?? data.chunk_count ?? "?"} chunks)`);
      }
      await loadDocs();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Erro de rede no upload");
    } finally {
      setDocAction(null);
      e.target.value = "";
    }
  }

  async function deleteDoc(docId: string) {
    setDocAction(docId);
    setDocError(null);
    const res = await fetch(`/api/knowledge/upload?id=${docId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDocError(data.error ?? "Falha ao eliminar documento");
    }
    await loadDocs();
    setDocAction(null);
  }

  async function reindexDoc(docId: string) {
    setDocAction(`reindex-${docId}`);
    setDocError(null);
    const res = await fetch("/api/knowledge/reindex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDocError(data.error ?? "Falha na reindexação");
    }
    await loadDocs();
    setDocAction(null);
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <Card className="h-64 animate-pulse" />
      </div>
    );
  }

  const thinkingSupported = modelSupportsThinking(model);
  const effortOptions: EffortLevel[] =
    model.includes("opus") ? ["low", "medium", "high", "max"] : ["low", "medium", "high"];

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="truncate text-lg font-semibold text-slate-900">{name}</h2>
          {activeVersion != null && <Badge tone="neutral">v{activeVersion}</Badge>}
          <Badge tone={agent.status === "published" ? "success" : "warning"}>{agent.status}</Badge>
        </div>
        <div className="flex flex-col items-end gap-1">
          {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
          {savedAt && !saveError && (
            <p className="text-xs text-slate-400">Guardado às {savedAt}</p>
          )}
          <Button onClick={saveNewVersion} disabled={saving}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 divide-x divide-line">
        <div className="flex w-[min(44%,520px)] shrink-0 flex-col">
          <div className="grid shrink-0 grid-cols-1 gap-2 border-b border-line p-3 sm:grid-cols-3">
            <Select label="Modelo" value={model} onChange={(e) => setModel(e.target.value)}>
              {(availableModels.length > 0
                ? availableModels
                : [{ id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" }]
              ).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
            <Select label="Esforço" value={effort} onChange={(e) => setEffort(e.target.value as EffortLevel)}>
              {effortOptions.map((level) => (
                <option key={level} value={level}>
                  {level === "low"
                    ? "Baixo"
                    : level === "medium"
                      ? "Médio"
                      : level === "high"
                        ? "Alto"
                        : "Máximo"}
                </option>
              ))}
            </Select>
            <div className="flex flex-col justify-end">
              <label className="mb-1 text-sm font-medium text-slate-700">Pensamento</label>
              <button
                type="button"
                disabled={!thinkingSupported}
                onClick={() => setThinkingEnabled((v) => !v)}
                className={cn(
                  "flex h-10 items-center justify-between rounded-xl border px-3 text-sm transition-colors",
                  !thinkingSupported && "cursor-not-allowed opacity-50",
                  thinkingEnabled
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-slate-600"
                )}
                title={
                  thinkingSupported
                    ? "Ativa pensamento adaptativo (extended thinking)"
                    : "Modelo sem suporte a pensamento"
                }
              >
                <span>{thinkingEnabled ? "Ativo" : "Desligado"}</span>
                <span
                  className={cn(
                    "h-5 w-9 rounded-full p-0.5 transition-colors",
                    thinkingEnabled ? "bg-brand-500" : "bg-slate-300"
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-full bg-white shadow transition-transform",
                      thinkingEnabled && "translate-x-4"
                    )}
                  />
                </span>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <label className="mb-1.5 text-sm font-medium text-slate-700">System prompt</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
              placeholder="Instruções do agente..."
            />
          </div>

          <div className="shrink-0 border-t border-line">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Configuração avançada
              <ChevronDown
                size={16}
                className={cn("transition-transform", advancedOpen && "rotate-180")}
              />
            </button>
            {advancedOpen && (
              <div className="max-h-[40vh] overflow-y-auto border-t border-line p-3">
                <div className="mb-3 flex gap-1 overflow-x-auto">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium",
                        tab === t.id
                          ? "bg-brand-500 text-white"
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <AdvancedTabContent
                  tab={tab}
                  name={name}
                  setName={setName}
                  description={description}
                  setDescription={setDescription}
                  visibility={visibility}
                  setVisibility={setVisibility}
                  category={category}
                  setCategory={setCategory}
                  tagsInput={tagsInput}
                  setTagsInput={setTagsInput}
                  agent={agent}
                  id={id}
                  knowledgeReady={knowledgeReady}
                  docError={docError}
                  docSuccess={docSuccess}
                  docAction={docAction}
                  docs={docs}
                  uploadKnowledge={uploadKnowledge}
                  deleteDoc={deleteDoc}
                  reindexDoc={reindexDoc}
                  versions={versions}
                  publishVersion={publishVersion}
                  rollbackVersion={rollbackVersion}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-3">
          <AgentChatPanel agentId={id} agentName={name} compact className="h-full" />
        </div>
      </div>
    </div>
  );
}

function AdvancedTabContent({
  tab,
  name,
  setName,
  description,
  setDescription,
  visibility,
  setVisibility,
  category,
  setCategory,
  tagsInput,
  setTagsInput,
  agent,
  id,
  knowledgeReady,
  docError,
  docSuccess,
  docAction,
  docs,
  uploadKnowledge,
  deleteDoc,
  reindexDoc,
  versions,
  publishVersion,
  rollbackVersion,
}: {
  tab: Tab;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  visibility: string;
  setVisibility: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  agent: Agent;
  id: string;
  knowledgeReady: boolean | null;
  docError: string | null;
  docSuccess: string | null;
  docAction: string | null;
  docs: Array<{
    id: string;
    filename: string;
    status: string;
    metadata?: Record<string, unknown>;
  }>;
  uploadKnowledge: (e: React.ChangeEvent<HTMLInputElement>) => void;
  deleteDoc: (id: string) => void;
  reindexDoc: (id: string) => void;
  versions: AgentVersion[];
  publishVersion: (id: string) => void;
  rollbackVersion: (id: string) => void;
}) {
  if (tab === "general") {
    return (
      <div className="space-y-4">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select label="Visibilidade" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="private">Privado — só eu</option>
          <option value="team">Equipa</option>
          <option value="public">Público — marketplace</option>
        </Select>
        <Select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          {MARKETPLACE_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </Select>
        <Input
          label="Tags"
          hint="Separadas por vírgula"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        {visibility === "public" && agent.status !== "published" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Guarde o agente para publicar no marketplace.
          </p>
        )}
      </div>
    );
  }

  if (tab === "knowledge") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Os documentos carregados são usados automaticamente nas conversas — não é preciso
          ativar skills. PDFs e imagens no chat são lidos nativamente pelo modelo.
        </p>
        {knowledgeReady === false && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Falta SUPABASE_SERVICE_ROLE_KEY no servidor.
          </p>
        )}
        {docError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{docError}</p>
        )}
        {docSuccess && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{docSuccess}</p>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-center hover:border-brand-300">
          <Upload size={20} className="text-brand-500" />
          <span className="text-xs font-medium text-slate-600">Carregar documento</span>
          <input
            type="file"
            className="hidden"
            onChange={uploadKnowledge}
            accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
            disabled={docAction === "upload"}
          />
        </label>
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs"
          >
            <span className="truncate">{doc.filename}</span>
            <div className="flex gap-1">
              <Badge tone={docTone[doc.status] ?? "warning"}>{doc.status}</Badge>
              <button type="button" onClick={() => deleteDoc(doc.id)} className="text-slate-400 hover:text-rose-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center justify-between rounded-lg border border-line p-2 text-xs">
          <span>
            v{v.version} · {v.status}
          </span>
          <div className="flex gap-1">
            {v.status !== "published" && (
              <Button size="sm" onClick={() => publishVersion(v.id)}>
                Publicar
              </Button>
            )}
            {v.status === "archived" && (
              <Button size="sm" variant="outline" onClick={() => rollbackVersion(v.id)}>
                Rollback
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

