"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  Save,
  Upload,
  History,
  ArrowLeft,
  Search,
  FileText,
  Eye,
  Library,
  Check,
  FileCheck2,
  Trash2,
  RefreshCw,
  ScanText,
  Globe,
  Database,
  Code,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { cn } from "@lib/utils";
import { MARKETPLACE_CATEGORIES } from "@lib/marketplace/constants";

type Tab = "general" | "prompt" | "knowledge" | "skills" | "model" | "versions";

interface AgentVersion {
  id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature: number;
  skills: string[];
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
  { id: "prompt", label: "Prompt" },
  { id: "knowledge", label: "Knowledge" },
  { id: "skills", label: "Skills" },
  { id: "model", label: "Modelo" },
  { id: "versions", label: "Versões" },
];

const SKILL_META: Record<string, { label: string; desc: string; icon: typeof Search; tone: string }> = {
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
};

const CORE_SKILLS = ["web_search", "read_document", "vision", "knowledge_search"];

const PLUGIN_SKILLS = ["http_request", "sql_query", "run_code"];

const PLUGIN_SKILL_META: Record<string, { label: string; desc: string; icon: typeof Globe; tone: string }> = {
  http_request: { label: "HTTP Request", desc: "Chamadas REST a APIs externas", icon: Globe, tone: "bg-indigo-50 text-indigo-600" },
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

function skillStatusBadge(readiness?: string) {
  if (readiness === "ready") return { tone: "success" as const, label: "Operacional" };
  if (readiness === "degraded") return { tone: "warning" as const, label: "Degradado" };
  if (readiness === "unavailable") return { tone: "danger" as const, label: "Indisponível" };
  return null;
}

export default function AgentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("general");
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
  const [temperature, setTemperature] = useState(0.7);
  const [skills, setSkills] = useState<string[]>(CORE_SKILLS);
  const [toolConfigs, setToolConfigs] = useState<Record<string, Record<string, unknown>>>(DEFAULT_TOOL_CONFIGS);
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
      setTemperature(Number(current.temperature));
      setSkills(current.skills ?? CORE_SKILLS);
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
      body: JSON.stringify({ system_prompt: systemPrompt, model, temperature, skills, tools: toolConfigs }),
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

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/agents")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Agentes
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
          {activeVersion != null && (
            <Badge tone="neutral">v{activeVersion}</Badge>
          )}
          <Badge tone={agent.status === "published" ? "success" : "warning"}>{agent.status}</Badge>
        </div>
        <div className="flex flex-col items-end gap-1">
          {saveError && (
            <p className="text-xs text-rose-600">{saveError}</p>
          )}
          {savedAt && !saveError && (
            <p className="text-xs text-slate-400">Último guardado às {savedAt}</p>
          )}
          <div className="flex gap-2">
          <Button variant="outline" onClick={saveNewVersion} disabled={saving}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar"}
          </Button>
          <Link href={`/agents/${id}/chat`}>
            <Button>
              <MessageSquare size={16} />
              Chat
            </Button>
          </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-brand-500 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === "general" && (
          <div className="space-y-5">
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea
              label="Descrição"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-slate-800">Marketplace</h3>
              <p className="mt-1 text-xs text-slate-500">
                Configure visibilidade e metadados para publicar no marketplace interno.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Visibilidade"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option value="private">Privado — só eu</option>
                  <option value="team">Equipa — membros da equipa</option>
                  <option value="public">Público — marketplace</option>
                </Select>
                <Select
                  label="Categoria"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {MARKETPLACE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                label="Tags"
                hint="Separadas por vírgula (ex: relatórios, análise, RH)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="mt-4"
              />
              {visibility === "public" && agent.status !== "published" && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Publique uma versão no separador Versões para o agente aparecer no marketplace.
                </p>
              )}
              {visibility === "public" && agent.status === "published" && (
                <Link
                  href={`/marketplace/${id}`}
                  className="mt-3 inline-flex text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Ver no marketplace →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Estado</p>
                <div className="mt-1.5">
                  <Badge tone={agent.status === "published" ? "success" : "warning"}>
                    {agent.status}
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Visibilidade
                </p>
                <p className="mt-1.5 text-sm font-medium capitalize text-slate-700">
                  {visibility}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Versões</p>
                <p className="mt-1.5 text-sm font-medium text-slate-700">{versions.length}</p>
              </div>
            </div>
          </div>
        )}

        {tab === "prompt" && (
          <Textarea
            label="System Prompt"
            hint="Define a personalidade, o tom e as regras do agente."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[320px] font-mono text-xs leading-relaxed"
          />
        )}

        {tab === "knowledge" && (
          <div className="space-y-5">
            {knowledgeReady === false && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Upload de Knowledge indisponível</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Falta <code className="rounded bg-white/70 px-1">SUPABASE_SERVICE_ROLE_KEY</code> no
                  Vercel (pode usar o valor da Secret Key do Supabase). Depois de adicionar, faça{" "}
                  <strong>redeploy</strong> do projeto.
                </p>
              </div>
            )}
            {docError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {docError}
              </div>
            )}
            {docSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {docSuccess}
              </div>
            )}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Upload size={22} />
              </span>
              <span className="text-sm font-medium text-slate-700">Carregar documento</span>
              <span className="text-xs text-slate-400">
                PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPG
              </span>
              <input
                type="file"
                className="hidden"
                onChange={uploadKnowledge}
                accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                disabled={docAction === "upload"}
              />
            </label>
            {docAction === "upload" && (
              <p className="text-center text-sm text-brand-600">A processar documento...</p>
            )}
            {docs.length > 0 ? (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <FileCheck2 size={18} className="shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-700">{doc.filename}</p>
                        {doc.metadata && (
                          <p className="text-xs text-slate-400">
                            {doc.metadata.chunk_count != null && `${doc.metadata.chunk_count} chunks`}
                            {doc.metadata.char_count != null && ` · ${doc.metadata.char_count.toLocaleString()} chars`}
                            {doc.metadata.error && (
                              <span className="block text-rose-500">{String(doc.metadata.error)}</span>
                            )}
                            {doc.metadata.ocr_used && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-violet-500">
                                <ScanText size={10} /> OCR
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={docTone[doc.status] ?? "warning"}>{doc.status}</Badge>
                      {doc.status === "ready" && (
                        <button
                          onClick={() => reindexDoc(doc.id)}
                          disabled={docAction === `reindex-${doc.id}`}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                          title="Reindexar"
                        >
                          <RefreshCw size={15} className={docAction === `reindex-${doc.id}` ? "animate-spin" : ""} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        disabled={docAction === doc.id}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm text-slate-400">Sem documentos carregados.</p>
            )}
          </div>
        )}

        {tab === "skills" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Skills Core</h3>
              <p className="mt-1 text-xs text-slate-500">
                Estado verificado no servidor. Skills «Indisponível» precisam de variáveis de ambiente na Vercel.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CORE_SKILLS.map((skill) => {
                  const meta = SKILL_META[skill];
                  const Icon = meta.icon;
                  const checked = skills.includes(skill);
                  const st = skillStatuses[skill];
                  const badge = skillStatusBadge(st?.readiness);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() =>
                        setSkills(checked ? skills.filter((s) => s !== skill) : [...skills, skill])
                      }
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                        checked
                          ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-200"
                          : "border-line hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                        <Icon size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">{meta.desc}</p>
                        {st?.note && (
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{st.note}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
                        )}
                      >
                        {checked && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-line pt-6">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Plugins (Fase 4)</h3>
                <Badge tone="brand">Novo</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                HTTP, SQL read-only e execução de código JavaScript sandboxed.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PLUGIN_SKILLS.map((skill) => {
                  const meta = PLUGIN_SKILL_META[skill];
                  const Icon = meta.icon;
                  const checked = skills.includes(skill);
                  const st = skillStatuses[skill];
                  const badge = skillStatusBadge(st?.readiness);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() =>
                        setSkills(checked ? skills.filter((s) => s !== skill) : [...skills, skill])
                      }
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                        checked
                          ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-200"
                          : "border-line hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                        <Icon size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">{meta.desc}</p>
                        {st?.note && (
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{st.note}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
                        )}
                      >
                        {checked && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {skills.includes("http_request") && (
                <Input
                  label="HTTP — hosts permitidos"
                  hint="Separados por vírgula (ex: api.example.com, *.mediacapital.pt)"
                  value={((toolConfigs.http_request?.allowed_hosts as string[]) ?? []).join(", ")}
                  onChange={(e) =>
                    setToolConfigs({
                      ...toolConfigs,
                      http_request: {
                        ...toolConfigs.http_request,
                        allowed_hosts: e.target.value
                          .split(",")
                          .map((h) => h.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  className="mt-4"
                />
              )}
            </div>
          </div>
        )}

        {tab === "model" && (
          <div className="max-w-md space-y-6">
            <Select label="Modelo" value={model} onChange={(e) => setModel(e.target.value)}>
              {(availableModels.length > 0
                ? availableModels
                : [
                    { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
                    { id: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
                    { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
                  ]
              ).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.status === "deprecated" ? " ⚠" : m.status === "legacy" ? " ·" : ""}
                </option>
              ))}
            </Select>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Temperature</label>
                <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                  {temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>Preciso</span>
                <span>Criativo</span>
              </div>
            </div>
          </div>
        )}

        {tab === "versions" && (
          <div className="space-y-3">
            {versions.length === 0 && (
              <p className="text-center text-sm text-slate-400">Ainda não existem versões.</p>
            )}
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                    <History size={18} />
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-medium text-slate-800">
                      v{v.version}
                      {v.status === "published" && <Badge tone="success">ativa</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {v.status}
                      {v.published_at ? ` · ${new Date(v.published_at).toLocaleDateString("pt-PT")}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
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
        )}
      </Card>
    </div>
  );
}
