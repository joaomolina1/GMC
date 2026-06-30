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
  Search,
  FileText,
  Eye,
  Library,
  Globe,
  Database,
  Code,
  Sparkles,
  FileOutput,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { AgentChatPanel } from "@/_components/AgentChatPanel";
import { cn } from "@lib/utils";
import type { EffortLevel } from "@lib/ai/types";
import { modelSupportsThinking } from "@lib/ai/anthropic-params";
import { TOOL_CREATE_DOCUMENTS } from "@lib/agents/agent-tools";
import { MARKETPLACE_CATEGORIES } from "@lib/marketplace/constants";

type Tab = "general" | "knowledge" | "tools" | "skills" | "versions";

interface SkillPackageRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface AgentVersion {
  id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature?: number;
  effort?: EffortLevel;
  thinking_enabled?: boolean;
  skills: string[];
  skill_package_ids?: string[];
  tools?: Record<string, Record<string, unknown>>;
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
  { id: "tools", label: "Tools" },
  { id: "skills", label: "Skills" },
  { id: "versions", label: "Versões" },
];

const TOOL_META: Record<string, { label: string; desc: string; icon: LucideIcon; tone: string }> = {
  web_search: {
    label: "Web Search",
    desc: "Pesquisa web nativa da API Anthropic (server-side, incluída na conta)",
    icon: Search,
    tone: "bg-sky-50 text-sky-600",
  },
  read_document: {
    label: "Read Document",
    desc: "PDF, Word, Excel, PowerPoint, CSV + OCR em imagens",
    icon: FileText,
    tone: "bg-rose-50 text-rose-600",
  },
  vision: {
    label: "Vision",
    desc: "Análise multimodal de imagens (requer ANTHROPIC_API_KEY)",
    icon: Eye,
    tone: "bg-violet-50 text-violet-600",
  },
  knowledge_search: {
    label: "Knowledge Search",
    desc: "RAG no Knowledge do agente (melhor com VOYAGE_API_KEY)",
    icon: Library,
    tone: "bg-emerald-50 text-emerald-600",
  },
  [TOOL_CREATE_DOCUMENTS]: {
    label: "Criar documentos",
    desc: "PowerPoint, Excel, Word e PDF via skills nativas Anthropic (API)",
    icon: FileOutput,
    tone: "bg-amber-50 text-amber-700",
  },
};

const CORE_TOOLS = [
  "web_search",
  TOOL_CREATE_DOCUMENTS,
  "read_document",
  "vision",
  "knowledge_search",
];

const PLUGIN_TOOLS = ["http_request", "fetch_url", "sql_query"];

const PLUGIN_TOOL_META: Record<string, { label: string; desc: string; icon: LucideIcon; tone: string }> = {
  http_request: { label: "HTTP Request", desc: "Chamadas REST a APIs externas (loop agêntico)", icon: Globe, tone: "bg-indigo-50 text-indigo-600" },
  fetch_url: { label: "Fetch URL", desc: "Extrai texto de páginas web públicas", icon: Globe, tone: "bg-sky-50 text-sky-600" },
  sql_query: { label: "SQL Query", desc: "Queries SELECT read-only na BD GMC", icon: Database, tone: "bg-cyan-50 text-cyan-600" },
  run_code: { label: "Run Code", desc: "JavaScript sandboxed para cálculos", icon: Code, tone: "bg-orange-50 text-orange-600" },
};

const DEFAULT_TOOL_CONFIGS: Record<string, Record<string, unknown>> = {
  http_request: { allowed_hosts: ["*.mediacapital.pt"], timeout_ms: 10000 },
  sql_query: { max_rows: 100 },
  run_code: { timeout_ms: 5000 },
};

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
  const [tools, setTools] = useState<string[]>(CORE_TOOLS);
  const [toolConfigs, setToolConfigs] = useState<Record<string, Record<string, unknown>>>(DEFAULT_TOOL_CONFIGS);
  const [skillPackages, setSkillPackages] = useState<SkillPackageRow[]>([]);
  const [skillPackageIds, setSkillPackageIds] = useState<string[]>([]);
  const [skillUploading, setSkillUploading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
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
  const [skillStatuses, setSkillStatuses] = useState<
    Record<string, { readiness: string; note: string; requirement?: string }>
  >({});

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/knowledge/upload?agentId=${id}`);
    const d = await res.json();
    setDocs(Array.isArray(d) ? d : []);
  }, [id]);

  const loadSkillPackages = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}/skill-packages`);
    const data = await res.json();
    setSkillPackages(Array.isArray(data) ? data : []);
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
      setTools(current.skills ?? CORE_TOOLS);
      setSkillPackageIds((current.skill_package_ids as string[]) ?? []);
      setToolConfigs({
        ...DEFAULT_TOOL_CONFIGS,
        ...(current.tools as Record<string, Record<string, unknown>> | undefined),
      });
      setActiveVersion(current.version);
    }
    setVersions(data.agent_versions ?? []);
  }, [id]);

  useEffect(() => {
    loadAgent();
    loadDocs();
    loadSkillPackages();
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setKnowledgeReady(Boolean(h.serviceRole)))
      .catch(() => setKnowledgeReady(null));
  }, [id, loadAgent, loadDocs, loadSkillPackages]);

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
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.status)) {
          const map: Record<string, { readiness: string; note: string; requirement?: string }> = {};
          for (const s of data.status as Array<{
            key: string;
            readiness: string;
            note: string;
            requirement?: string;
          }>) {
            map[s.key] = { readiness: s.readiness, note: s.note, requirement: s.requirement };
          }
          setSkillStatuses(map);
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
        skills: tools,
        tools: toolConfigs,
        skill_package_ids: skillPackageIds,
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

  async function uploadSkillPackage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSkillUploading(true);
    setSkillError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/agents/${id}/skill-packages`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSkillError((data as { error?: string }).error ?? "Upload falhou");
      } else {
        const row = data as SkillPackageRow;
        await loadSkillPackages();
        setSkillPackageIds((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
      }
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setSkillUploading(false);
      e.target.value = "";
    }
  }

  async function deleteSkillPackage(packageId: string) {
    setSkillError(null);
    const res = await fetch(`/api/agents/${id}/skill-packages?id=${packageId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSkillError((data as { error?: string }).error ?? "Falha ao eliminar");
      return;
    }
    setSkillPackageIds((prev) => prev.filter((sid) => sid !== packageId));
    await loadSkillPackages();
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
                  tools={tools}
                  setTools={setTools}
                  toolConfigs={toolConfigs}
                  setToolConfigs={setToolConfigs}
                  skillStatuses={skillStatuses}
                  skillPackages={skillPackages}
                  skillPackageIds={skillPackageIds}
                  setSkillPackageIds={setSkillPackageIds}
                  skillUploading={skillUploading}
                  skillError={skillError}
                  uploadSkillPackage={uploadSkillPackage}
                  deleteSkillPackage={deleteSkillPackage}
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
  tools,
  setTools,
  toolConfigs,
  setToolConfigs,
  skillStatuses,
  skillPackages,
  skillPackageIds,
  setSkillPackageIds,
  skillUploading,
  skillError,
  uploadSkillPackage,
  deleteSkillPackage,
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
  tools: string[];
  setTools: React.Dispatch<React.SetStateAction<string[]>>;
  toolConfigs: Record<string, Record<string, unknown>>;
  setToolConfigs: React.Dispatch<React.SetStateAction<Record<string, Record<string, unknown>>>>;
  skillStatuses: Record<string, { readiness: string; note: string; requirement?: string }>;
  skillPackages: SkillPackageRow[];
  skillPackageIds: string[];
  setSkillPackageIds: React.Dispatch<React.SetStateAction<string[]>>;
  skillUploading: boolean;
  skillError: string | null;
  uploadSkillPackage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  deleteSkillPackage: (id: string) => void;
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

  if (tab === "tools") {
    const docStatus = skillStatuses[TOOL_CREATE_DOCUMENTS];
    const docEnabled = tools.includes(TOOL_CREATE_DOCUMENTS);
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Tools são capacidades técnicas do agente. <strong>Criar documentos</strong> activa
          PowerPoint, Excel, Word e PDF via API Anthropic (requer code execution na conta).
        </p>
        {!docEnabled && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sem «Criar documentos», pedidos de PowerPoint/Excel/Word/PDF só produzem texto —
            não há ficheiro para download.
          </p>
        )}
        {docEnabled && docStatus && docStatus.readiness !== "ready" && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {docStatus.note}
            {docStatus.requirement ? ` (${docStatus.requirement})` : ""}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {CORE_TOOLS.map((tool) => {
            const meta = TOOL_META[tool];
            const Icon = meta.icon;
            const checked = tools.includes(tool);
            const status = skillStatuses[tool];
            return (
              <button
                key={tool}
                type="button"
                onClick={() =>
                  setTools(checked ? tools.filter((s) => s !== tool) : [...tools, tool])
                }
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2 text-left text-xs",
                  checked ? "border-brand-300 bg-brand-50" : "border-line"
                )}
              >
                <Icon size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{meta.label}</span>
                  <p className="mt-0.5 text-[10px] text-slate-500">{meta.desc}</p>
                  {status && (
                    <p className="mt-1 text-[10px] text-slate-400">{status.note}</p>
                  )}
                </div>
                {checked && <Check size={12} className="shrink-0 text-brand-600" />}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-2">
          {PLUGIN_TOOLS.map((tool) => {
            const meta = PLUGIN_TOOL_META[tool];
            const Icon = meta.icon;
            const checked = tools.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() =>
                  setTools(checked ? tools.filter((s) => s !== tool) : [...tools, tool])
                }
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 text-left text-xs",
                  checked ? "border-brand-300 bg-brand-50" : "border-line"
                )}
              >
                <Icon size={14} />
                <span className="font-medium">{meta.label}</span>
                {checked && <Check size={12} className="ml-auto text-brand-600" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (tab === "skills") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Skills no formato Claude: pacote ZIP ou ficheiro <code>.skill</code> com{" "}
          <code>SKILL.md</code> (frontmatter YAML + instruções). O agente aplica a skill quando
          a tarefa corresponde à descrição.
        </p>
        {skillError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{skillError}</p>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-center hover:border-brand-300">
          <Sparkles size={20} className="text-brand-500" />
          <span className="text-xs font-medium text-slate-600">
            {skillUploading ? "A carregar…" : "Carregar skill (.skill, .zip ou SKILL.md)"}
          </span>
          <input
            type="file"
            className="hidden"
            onChange={uploadSkillPackage}
            accept=".skill,.zip,.md"
            disabled={skillUploading}
          />
        </label>
        {skillPackages.length === 0 ? (
          <p className="text-center text-xs text-slate-400">Nenhuma skill carregada.</p>
        ) : (
          <div className="space-y-2">
            {skillPackages.map((pkg) => {
              const active = skillPackageIds.includes(pkg.id);
              return (
                <div
                  key={pkg.id}
                  className={cn(
                    "rounded-lg border p-3 text-xs",
                    active ? "border-brand-300 bg-brand-50/50" : "border-line"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setSkillPackageIds((prev) =>
                          active ? prev.filter((sid) => sid !== pkg.id) : [...prev, pkg.id]
                        )
                      }
                    >
                      <p className="font-semibold text-slate-800">{pkg.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-500">{pkg.description}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={active ? "brand" : "neutral"}>
                        {active ? "Ativa" : "Inativa"}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => deleteSkillPackage(pkg.id)}
                        className="rounded p-1 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

