"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Save, Upload, History } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Input, Textarea } from "@/_design_system/Input";

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

const CORE_SKILLS = ["web_search", "read_document", "vision", "knowledge_search"];

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

  const loadAgent = useCallback(async () => {
    const res = await fetch(`/api/agents/${id}`);
    const data = await res.json();
    setAgent(data);
    setName(data.name);
    setDescription(data.description ?? "");
    const current = data.agent_versions?.find(
      (v: AgentVersion) => v.id === data.current_version_id
    ) ?? data.agent_versions?.[0];
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
      .then(setDocs)
      .catch(() => {});
  }, [id, loadAgent]);

  async function saveNewVersion() {
    setSaving(true);
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

  if (!agent) return <p className="text-gray-500">A carregar...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{name}</h2>
          <p className="text-gray-500">Agent Builder</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={saveNewVersion} disabled={saving}>
            <Save size={16} />
            {saving ? "A guardar..." : "Guardar v+"}
          </Button>
          <Link href={`/agents/${id}/chat`}>
            <Button>
              <MessageSquare size={16} />
              Chat
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-[#0066B3] text-[#0066B3]"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === "general" && (
          <div className="space-y-4">
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        )}

        {tab === "prompt" && (
          <Textarea
            label="System Prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
          />
        )}

        {tab === "knowledge" && (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 p-6 hover:border-[#0066B3]">
              <Upload size={20} className="text-gray-400" />
              <span className="text-sm text-gray-600">Carregar documento (PDF, DOCX, TXT, MD, CSV)</span>
              <input type="file" className="hidden" onChange={uploadKnowledge} accept=".pdf,.docx,.txt,.md,.csv" />
            </label>
            <ul className="space-y-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 text-sm">
                  <span>{doc.filename}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    doc.status === "ready" ? "bg-green-100 text-green-700" :
                    doc.status === "error" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{doc.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "skills" && (
          <div className="space-y-3">
            {CORE_SKILLS.map((skill) => (
              <label key={skill} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                <input
                  type="checkbox"
                  checked={skills.includes(skill)}
                  onChange={(e) => {
                    if (e.target.checked) setSkills([...skills, skill]);
                    else setSkills(skills.filter((s) => s !== skill));
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-[#0066B3]"
                />
                <span className="text-sm font-medium text-gray-900">{skill}</span>
              </label>
            ))}
          </div>
        )}

        {tab === "model" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Modelo</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                Temperature: {temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
          </div>
        )}

        {tab === "versions" && (
          <div className="space-y-3">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <History size={16} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">v{v.version}</p>
                    <p className="text-xs text-gray-500">
                      {v.status} {v.published_at ? `· ${new Date(v.published_at).toLocaleDateString("pt-PT")}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {v.status !== "published" && (
                    <Button size="sm" onClick={() => publishVersion(v.id)}>Publicar</Button>
                  )}
                  {v.status === "archived" && (
                    <Button size="sm" variant="secondary" onClick={() => rollbackVersion(v.id)}>
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
