"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Check,
  MessagesSquare,
  PanelLeftClose,
  ChevronRight,
  History,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { AgentChatPanel } from "@/_components/AgentChatPanel";
import { ConversationHistorySidebar } from "@/_components/ConversationHistorySidebar";
import { cn } from "@lib/utils";
import type { EffortLevel } from "@lib/ai/types";
import { modelSupportsThinking } from "@lib/ai/anthropic-params";
import { DEFAULT_AGENT_MODEL } from "@lib/agents/constants";
import {
  AdvancedTabContent,
  type KnowledgeUploadItem,
} from "./agent-builder/AdvancedTabContent";
import {
  BUILDER_TABS,
  CORE_TOOLS,
  DEFAULT_TOOL_CONFIGS,
  TAB_INTRO,
  type BuilderTab,
} from "./agent-builder/constants";
import type { Agent, AgentVersion, McpConnectionRow, SkillPackageRow } from "./agent-builder/types";

type Tab = BuilderTab;

type SaveSnapshotFields = {
  name: string;
  description: string;
  visibility: string;
  category: string;
  tagsInput: string;
  systemPrompt: string;
  model: string;
  effort: EffortLevel;
  thinkingEnabled: boolean;
  tools: string[];
  skillPackageIds: string[];
  toolConfigs: Record<string, Record<string, unknown>>;
};

function buildSaveSnapshot(fields: SaveSnapshotFields): string {
  return JSON.stringify({
    name: fields.name,
    description: fields.description,
    visibility: fields.visibility,
    category: fields.category,
    tagsInput: fields.tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .sort()
      .join(","),
    systemPrompt: fields.systemPrompt,
    model: fields.model,
    effort: fields.effort,
    thinkingEnabled: fields.thinkingEnabled,
    tools: [...fields.tools].sort(),
    skillPackageIds: [...fields.skillPackageIds].sort(),
    toolConfigs: fields.toolConfigs,
  });
}

export default function AgentBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
          <Card className="h-64 animate-pulse" />
        </div>
      }
    >
      <AgentBuilderWorkspace />
    </Suspense>
  );
}

function AgentBuilderWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c") ?? undefined;
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("instructions");
  const [configureOpen, setConfigureOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [category, setCategory] = useState("geral");
  const [tagsInput, setTagsInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_AGENT_MODEL);
  const [canChangeModel, setCanChangeModel] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; display_name: string; status?: string }>
  >([]);
  const [effort, setEffort] = useState<EffortLevel>("low");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [tools, setTools] = useState<string[]>(CORE_TOOLS);
  const [toolConfigs, setToolConfigs] = useState<Record<string, Record<string, unknown>>>(DEFAULT_TOOL_CONFIGS);
  const [skillPackages, setSkillPackages] = useState<SkillPackageRow[]>([]);
  const [skillPackageIds, setSkillPackageIds] = useState<string[]>([]);
  const [skillUploading, setSkillUploading] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [mcpConnections, setMcpConnections] = useState<McpConnectionRow[]>([]);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpSaving, setMcpSaving] = useState(false);
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
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [docAction, setDocAction] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<KnowledgeUploadItem[]>([]);
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

  const loadMcpConnections = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}/mcp-connections`);
    const data = await res.json();
    setMcpConnections(Array.isArray(data) ? data : []);
  }, [id]);

  const loadAgent = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/agents/${id}`);
    const data = await res.json();
    if (!res.ok || !data?.id) {
      setLoadError(data?.error ?? "Não foi possível carregar o agente.");
      return;
    }
    setAgent(data);
    setCanChangeModel(Boolean(data.permissions?.canChangeModel));
    const nextName = data.name ?? "";
    const nextDescription = data.description ?? "";
    const nextVisibility = data.visibility ?? "private";
    const nextCategory = data.category ?? "geral";
    const nextTagsInput = (data.tags ?? []).join(", ");
    setName(nextName);
    setDescription(nextDescription);
    setVisibility(nextVisibility);
    setCategory(nextCategory);
    setTagsInput(nextTagsInput);
    const current =
      data.agent_versions?.find((v: AgentVersion) => v.id === data.current_version_id) ??
      data.agent_versions?.[0];
    const nextSystemPrompt = current?.system_prompt ?? "";
    const nextModel = current?.model ?? DEFAULT_AGENT_MODEL;
    const nextEffort = ((current?.effort as EffortLevel) ?? "low") as EffortLevel;
    const nextThinking = Boolean(current?.thinking_enabled);
    const nextTools = current?.skills ?? CORE_TOOLS;
    const nextSkillPackageIds = (current?.skill_package_ids as string[]) ?? [];
    const nextToolConfigs = {
      ...DEFAULT_TOOL_CONFIGS,
      ...(current?.tools as Record<string, Record<string, unknown>> | undefined),
    };
    if (current) {
      setSystemPrompt(nextSystemPrompt);
      setModel(nextModel);
      setEffort(nextEffort);
      setThinkingEnabled(nextThinking);
      setTools(nextTools);
      setSkillPackageIds(nextSkillPackageIds);
      setToolConfigs(nextToolConfigs);
      setActiveVersion(current.version);
    }
    setVersions(data.agent_versions ?? []);
    setSavedSnapshot(
      buildSaveSnapshot({
        name: nextName,
        description: nextDescription,
        visibility: nextVisibility,
        category: nextCategory,
        tagsInput: nextTagsInput,
        systemPrompt: nextSystemPrompt,
        model: nextModel,
        effort: nextEffort,
        thinkingEnabled: nextThinking,
        tools: nextTools,
        skillPackageIds: nextSkillPackageIds,
        toolConfigs: nextToolConfigs,
      })
    );
  }, [id]);

  useEffect(() => {
    loadAgent();
    loadDocs();
    loadSkillPackages();
    loadMcpConnections();
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setKnowledgeReady(Boolean(h.serviceRole)))
      .catch(() => setKnowledgeReady(null));
  }, [id, loadAgent, loadDocs, loadSkillPackages, loadMcpConnections]);

  useEffect(() => {
    const modelsUrl = canChangeModel ? "/api/models?all=true&includeRetired=true" : "/api/models";
    fetch(modelsUrl)
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
  }, [canChangeModel]);

  const currentSnapshot = useMemo(
    () =>
      buildSaveSnapshot({
        name,
        description,
        visibility,
        category,
        tagsInput,
        systemPrompt,
        model,
        effort,
        thinkingEnabled,
        tools,
        skillPackageIds,
        toolConfigs,
      }),
    [
      name,
      description,
      visibility,
      category,
      tagsInput,
      systemPrompt,
      model,
      effort,
      thinkingEnabled,
      tools,
      skillPackageIds,
      toolConfigs,
    ]
  );
  const isDirty = savedSnapshot != null && currentSnapshot !== savedSnapshot;
  const canSave = isDirty || agent?.status !== "published";

  async function saveAgent(options: { createSnapshot?: boolean } = {}) {
    const { createSnapshot = false } = options;
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
        createSnapshot,
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
    if (createSnapshot) {
      setVersions((prev) => {
        const archived = prev.map((v) =>
          v.status === "published" && v.id !== savedVersion.id
            ? { ...v, status: "archived" }
            : v
        );
        const withoutDup = archived.filter((v) => v.id !== savedVersion.id);
        return [savedVersion, ...withoutDup];
      });
    } else {
      setVersions((prev) => {
        const idx = prev.findIndex((v) => v.id === savedVersion.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedVersion;
          return next;
        }
        return [savedVersion, ...prev];
      });
    }
    setActiveVersion(savedVersion.version);
    setSavedAt(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
    setSavedSnapshot(currentSnapshot);

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
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setDocAction("upload");
    setDocError(null);
    setDocSuccess(null);
    setUploadProgress(files.map((file) => ({ name: file.name, status: "pending" })));

    let okCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item))
      );

      const form = new FormData();
      form.append("file", file);
      form.append("agentId", id);

      try {
        const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failCount += 1;
          const message = (data as { error?: string }).error ?? `Upload falhou (${res.status})`;
          errors.push(`${file.name}: ${message}`);
          setUploadProgress((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: message } : item
            )
          );
        } else {
          okCount += 1;
          setUploadProgress((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: "ok" } : item))
          );
        }
      } catch (err) {
        failCount += 1;
        const message = err instanceof Error ? err.message : "Erro de rede no upload";
        errors.push(`${file.name}: ${message}`);
        setUploadProgress((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "error", error: message } : item
          )
        );
      }
    }

    await loadDocs();

    if (okCount > 0 && failCount === 0) {
      setDocSuccess(
        okCount === 1
          ? `${files[0].name} indexado com sucesso`
          : `${okCount} documentos indexados com sucesso`
      );
    } else if (okCount > 0 && failCount > 0) {
      setDocSuccess(`${okCount} documento(s) indexado(s)`);
      setDocError(`${failCount} falhou/falharam. ${errors[0] ?? ""}`);
    } else {
      setDocError(errors[0] ?? "Nenhum documento foi indexado");
    }

    setDocAction(null);
    e.target.value = "";
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

  const setActiveConversation = useCallback(
    (nextId: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextId) params.set("c", nextId);
      else params.delete("c");
      const qs = params.toString();
      router.replace(qs ? `/agents/${id}?${qs}` : `/agents/${id}`, { scroll: false });
    },
    [id, router, searchParams]
  );

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-5">
        <Card className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-900">Agente indisponível</h2>
          <p role="alert" className="mt-2 text-sm text-slate-500">{loadError}</p>
          <Button className="mt-5" variant="outline" onClick={() => router.push("/")}>
            <ArrowLeft size={16} />
            Voltar aos agentes
          </Button>
        </Card>
      </div>
    );
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
  const intro = TAB_INTRO[tab];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {name || "Novo agente"}
              </h2>
              {activeVersion != null && <Badge tone="neutral">v{activeVersion}</Badge>}
              <Badge tone={agent.status === "published" ? "success" : "warning"}>
                {agent.status}
              </Badge>
            </div>
            <p className="truncate text-xs text-slate-400">
              {description || "Configure prompt, tools, skills e knowledge"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {saveError && <p role="alert" className="max-w-[18rem] text-xs text-rose-600">{saveError}</p>}
          {isDirty && !saveError && (
            <p className="hidden text-xs text-amber-600 sm:block">Alterações por guardar</p>
          )}
          {savedAt && !saveError && !isDirty && (
            <p className="hidden text-xs text-slate-400 sm:block">Guardado às {savedAt}</p>
          )}
          <Button
            variant="outline"
            onClick={() => void saveAgent({ createSnapshot: true })}
            disabled={saving}
            title="Cria um snapshot v+1 e torna-o a versão ativa"
          >
            <History size={16} />
            <span className="hidden sm:inline">Nova versão</span>
          </Button>
          <Button
            onClick={() => void saveAgent()}
            disabled={saving || !canSave}
            title={
              canSave
                ? "Guardar alterações na versão ativa"
                : "Sem alterações para guardar"
            }
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar"}
          </Button>
        </div>
      </header>

      {/* Two-zone workspace */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3",
          configureOpen
            ? "grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]"
            : "grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]"
        )}
      >
        {/* ── Zone 1: Configure ───────────────────────────── */}
        <section className="flex min-h-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <nav className="flex w-14 shrink-0 flex-col gap-1 border-r border-line bg-slate-50/70 p-2 lg:w-44">
            {BUILDER_TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setConfigureOpen(true);
                  }}
                  title={t.label}
                  className={cn(
                    "flex items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
                    active
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-800"
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setConfigureOpen((open) => !open)}
              title={configureOpen ? "Encolher painel" : "Expandir painel"}
              className="mt-auto flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-600 lg:justify-start"
            >
              {configureOpen ? <PanelLeftClose size={16} /> : <ChevronRight size={16} />}
              <span className="hidden text-xs font-medium lg:inline">
                {configureOpen ? "Encolher" : "Expandir"}
              </span>
            </button>
          </nav>

          {configureOpen ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-line px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{intro.title}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{intro.desc}</p>
            </div>

            {tab === "instructions" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="grid shrink-0 grid-cols-1 gap-3 border-b border-line p-4 sm:grid-cols-3">
                  <Select
                    label="Modelo"
                    value={model}
                    disabled={!canChangeModel}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {(availableModels.length > 0
                      ? availableModels
                      : [{ id: DEFAULT_AGENT_MODEL, display_name: "Claude Haiku 4.5" }]
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Esforço"
                    value={effort}
                    onChange={(e) => setEffort(e.target.value as EffortLevel)}
                  >
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
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700">Pensamento</label>
                    <button
                      type="button"
                      disabled={!thinkingSupported}
                      onClick={() => setThinkingEnabled((v) => !v)}
                      className={cn(
                        "flex h-[42px] items-center justify-between rounded-lg border px-3 text-sm transition-colors",
                        !thinkingSupported && "cursor-not-allowed opacity-50",
                        thinkingEnabled
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-slate-200 bg-white text-slate-600"
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
                  {!canChangeModel && (
                    <p className="col-span-full text-[11px] text-slate-500">
                      O modelo é gerido pela plataforma. Apenas super_admin pode alterá-lo.
                    </p>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">System prompt</label>
                    <span className="text-[11px] text-slate-400">
                      {systemPrompt.length} caracteres
                    </span>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 font-mono text-xs leading-relaxed text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                    placeholder="Descreve o comportamento, tom e regras do agente…"
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
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
                  uploadProgress={uploadProgress}
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
                  mcpConnections={mcpConnections}
                  mcpName={mcpName}
                  setMcpName={setMcpName}
                  mcpUrl={mcpUrl}
                  setMcpUrl={setMcpUrl}
                  mcpToken={mcpToken}
                  setMcpToken={setMcpToken}
                  mcpSaving={mcpSaving}
                  setMcpSaving={setMcpSaving}
                  loadMcpConnections={loadMcpConnections}
                  versions={versions}
                  currentVersionId={agent.current_version_id ?? null}
                  publishVersion={publishVersion}
                  rollbackVersion={rollbackVersion}
                />
              </div>
            )}
          </div>
          ) : null}
        </section>

        {/* ── Zone 2: Test ────────────────────────────────── */}
        <section className="flex min-h-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 flex-1 flex-col p-3">
            <AgentChatPanel
              agentId={id}
              agentName={name}
              compact
              className="h-full"
              conversationId={conversationId}
              onConversationIdChange={setActiveConversation}
              onConversationActivity={() => setHistoryRefresh((n) => n + 1)}
            />
          </div>
          {historyOpen ? (
            <ConversationHistorySidebar
              agentId={id}
              activeConversationId={conversationId}
              onSelect={setActiveConversation}
              refreshKey={historyRefresh}
              onCollapse={() => setHistoryOpen(false)}
              side="right"
            />
          ) : (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="Mostrar histórico"
              className="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-line bg-slate-50/70 py-3 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <MessagesSquare size={16} />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
