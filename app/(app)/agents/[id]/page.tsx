"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Check,
  MessagesSquare,
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
import { AdvancedTabContent } from "./agent-builder/AdvancedTabContent";
import {
  BUILDER_TABS,
  CORE_TOOLS,
  DEFAULT_TOOL_CONFIGS,
  TAB_INTRO,
  type BuilderTab,
} from "./agent-builder/constants";
import type { Agent, AgentVersion, McpConnectionRow, SkillPackageRow } from "./agent-builder/types";

type Tab = BuilderTab;

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
  const [tab, setTab] = useState<Tab>("instructions");
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

  const loadMcpConnections = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}/mcp-connections`);
    const data = await res.json();
    setMcpConnections(Array.isArray(data) ? data : []);
  }, [id]);

  const loadAgent = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}`);
    const data = await res.json();
    if (!res.ok || !data?.id) return;
    setAgent(data);
    setCanChangeModel(Boolean(data.permissions?.canChangeModel));
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
      setEffort((current.effort as EffortLevel) ?? "low");
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
    <div className="flex h-[calc(100vh-5rem)] min-h-0 flex-col gap-3">
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
        <div className="flex items-center gap-3">
          {saveError && <p className="max-w-[16rem] truncate text-xs text-rose-600">{saveError}</p>}
          {savedAt && !saveError && (
            <p className="hidden text-xs text-slate-400 sm:block">Guardado às {savedAt}</p>
          )}
          <Button onClick={saveNewVersion} disabled={saving}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar"}
          </Button>
        </div>
      </header>

      {/* Two-zone workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
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
                  onClick={() => setTab(t.id)}
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
          </nav>

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
                  publishVersion={publishVersion}
                  rollbackVersion={rollbackVersion}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Zone 2: Test ────────────────────────────────── */}
        <section className="flex min-h-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          {historyOpen ? (
            <ConversationHistorySidebar
              agentId={id}
              activeConversationId={conversationId}
              onSelect={setActiveConversation}
              refreshKey={historyRefresh}
              onCollapse={() => setHistoryOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="Mostrar histórico"
              className="flex w-10 shrink-0 flex-col items-center gap-2 border-r border-line bg-slate-50/70 py-3 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <MessagesSquare size={16} />
            </button>
          )}
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
        </section>
      </div>
    </div>
  );
}
