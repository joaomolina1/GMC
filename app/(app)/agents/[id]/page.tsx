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
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { cn } from "@lib/utils";

type Tab = "general" | "prompt" | "knowledge" | "skills" | "model" | "versions";

interface AgentVersion {
  id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature: number;
  skills: string[];
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
  web_search: { label: "Web Search", desc: "Pesquisa na internet em tempo real", icon: Search, tone: "bg-sky-50 text-sky-600" },
  read_document: { label: "Read Document", desc: "Lê PDF, Word, Excel e CSV", icon: FileText, tone: "bg-rose-50 text-rose-600" },
  vision: { label: "Vision", desc: "Analisa e interpreta imagens", icon: Eye, tone: "bg-violet-50 text-violet-600" },
  knowledge_search: { label: "Knowledge Search", desc: "RAG semântico sobre documentos", icon: Library, tone: "bg-emerald-50 text-emerald-600" },
};

const CORE_SKILLS = ["web_search", "read_document", "vision", "knowledge_search"];

const docTone: Record<string, "success" | "warning" | "danger"> = {
  ready: "success",
  error: "danger",
};

export default function AgentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [temperature, setTemperature] = useState(0.7);
  const [skills, setSkills] = useState<string[]>(CORE_SKILLS);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [docs, setDocs] = useState<Array<{ id: string; filename: string; status: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadAgent = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}`);
    const data = await res.json();
    setAgent(data);
    setName(data.name);
    setDescription(data.description ?? "");
    const current =
      data.agent_versions?.find((v: AgentVersion) => v.id === data.current_version_id) ??
      data.agent_versions?.[0];
    if (current) {
      setSystemPrompt(current.system_prompt);
      setModel(current.model);
      setTemperature(Number(current.temperature));
      setSkills(current.skills ?? CORE_SKILLS);
    }
    setVersions(data.agent_versions ?? []);
  }, [id]);

  useEffect(() => {
    loadAgent();
    fetch(`/api/knowledge/upload?agentId=${id}`)
      .then((r) => r.json())
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [id, loadAgent]);

  async function saveNewVersion() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/agents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: systemPrompt, model, temperature, skills }),
    });
    await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    await loadAgent();
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
    const form = new FormData();
    form.append("file", file);
    form.append("agentId", id);
    await fetch("/api/knowledge/upload", { method: "POST", body: form });
    const res = await fetch(`/api/knowledge/upload?agentId=${id}`);
    setDocs(await res.json());
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
          <Badge tone={agent.status === "published" ? "success" : "warning"}>{agent.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveNewVersion} disabled={saving}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? "A guardar..." : saved ? "Guardado" : "Guardar v+"}
          </Button>
          <Link href={`/agents/${id}/chat`}>
            <Button>
              <MessageSquare size={16} />
              Chat
            </Button>
          </Link>
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
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <Upload size={22} />
              </span>
              <span className="text-sm font-medium text-slate-700">Carregar documento</span>
              <span className="text-xs text-slate-400">PDF, DOCX, TXT, MD, CSV</span>
              <input
                type="file"
                className="hidden"
                onChange={uploadKnowledge}
                accept=".pdf,.docx,.txt,.md,.csv"
              />
            </label>
            {docs.length > 0 ? (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700">
                      <FileCheck2 size={18} className="shrink-0 text-slate-400" />
                      <span className="truncate">{doc.filename}</span>
                    </span>
                    <Badge tone={docTone[doc.status] ?? "warning"}>{doc.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm text-slate-400">Sem documentos carregados.</p>
            )}
          </div>
        )}

        {tab === "skills" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CORE_SKILLS.map((skill) => {
              const meta = SKILL_META[skill];
              const Icon = meta.icon;
              const checked = skills.includes(skill);
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
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                    <p className="text-xs text-slate-500">{meta.desc}</p>
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
        )}

        {tab === "model" && (
          <div className="max-w-md space-y-6">
            <Select label="Modelo" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
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
