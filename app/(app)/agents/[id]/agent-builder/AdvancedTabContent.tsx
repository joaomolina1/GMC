"use client";

import {
  Check,
  Trash2,
  Upload,
  Sparkles,
  Link2,
  Plug,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Input, Textarea, Select } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { cn } from "@lib/utils";
import { TOOL_CREATE_DOCUMENTS } from "@lib/agents/agent-tools";
import { MARKETPLACE_CATEGORIES } from "@lib/marketplace/constants";
import {
  CORE_TOOLS,
  DOC_TONE,
  PLUGIN_TOOL_META,
  PLUGIN_TOOLS,
  TOOL_META,
  VERSION_STATUS_LABEL,
  VERSION_STATUS_TONE,
  type BuilderTab,
} from "./constants";
import type { Agent, AgentVersion, McpConnectionRow, SkillPackageRow } from "./types";

export type KnowledgeUploadItem = {
  name: string;
  status: "pending" | "uploading" | "ok" | "error";
  error?: string;
};

export function AdvancedTabContent({
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
  uploadProgress,
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
  mcpConnections,
  mcpName,
  setMcpName,
  mcpUrl,
  setMcpUrl,
  mcpToken,
  setMcpToken,
  mcpSaving,
  setMcpSaving,
  loadMcpConnections,
  versions,
  currentVersionId,
  publishVersion,
  rollbackVersion,
}: {
  tab: BuilderTab;
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
  uploadProgress: KnowledgeUploadItem[];
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
  mcpConnections: McpConnectionRow[];
  mcpName: string;
  setMcpName: (v: string) => void;
  mcpUrl: string;
  setMcpUrl: (v: string) => void;
  mcpToken: string;
  setMcpToken: (v: string) => void;
  mcpSaving: boolean;
  setMcpSaving: React.Dispatch<React.SetStateAction<boolean>>;
  loadMcpConnections: () => Promise<void>;
  versions: AgentVersion[];
  currentVersionId: string | null;
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
            Guarde o agente para o tornar disponível no marketplace.
          </p>
        )}
      </div>
    );
  }

  if (tab === "knowledge") {
    const uploading = docAction === "upload";
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
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-center hover:border-brand-300",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          <Upload size={20} className="text-brand-500" />
          <span className="text-xs font-medium text-slate-600">
            {uploading ? "A carregar documentos…" : "Carregar documentos"}
          </span>
          <span className="text-[10px] text-slate-400">
            Pode selecionar vários ficheiros de uma vez
          </span>
          <input
            type="file"
            className="hidden"
            onChange={uploadKnowledge}
            accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
            multiple
            disabled={uploading}
          />
        </label>
        {uploadProgress.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-line bg-slate-50 p-2.5">
            {uploadProgress.map((item, index) => (
              <li
                key={`${index}-${item.name}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-slate-700">{item.name}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    item.status === "ok" && "text-emerald-600",
                    item.status === "error" && "text-rose-600",
                    item.status === "uploading" && "text-brand-600",
                    item.status === "pending" && "text-slate-400"
                  )}
                  title={item.error}
                >
                  {item.status === "ok"
                    ? "Indexado"
                    : item.status === "error"
                      ? "Erro"
                      : item.status === "uploading"
                        ? "A indexar…"
                        : "Em fila"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {docs.length === 0 && uploadProgress.length === 0 ? (
          <p className="text-center text-xs text-slate-400">
            Ainda não há documentos. Só este agente usa estes ficheiros no chat.
          </p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs"
            >
              <span className="truncate">{doc.filename}</span>
              <div className="flex gap-1">
                <Badge tone={DOC_TONE[doc.status] ?? "warning"}>{doc.status}</Badge>
                {doc.status === "error" && (
                  <button
                    type="button"
                    onClick={() => reindexDoc(doc.id)}
                    disabled={docAction === `reindex-${doc.id}`}
                    className="rounded p-1 text-slate-400 hover:text-brand-600"
                    title="Reindexar"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteDoc(doc.id)}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
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

  if (tab === "connectors") {
    async function addMcpConnection() {
      if (!mcpName.trim() || !mcpUrl.trim()) return;
      setMcpSaving(true);
      const res = await fetch(`/api/agents/${id}/mcp-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mcpName.trim(),
          server_url: mcpUrl.trim(),
          auth_secret_ref: mcpToken.trim() || undefined,
        }),
      });
      setMcpSaving(false);
      if (res.ok) {
        setMcpName("");
        setMcpUrl("");
        setMcpToken("");
        await loadMcpConnections();
      }
    }

    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Liga servidores MCP (Gmail, Drive, GMC Remote, etc.) via API Anthropic. O token deve ser o
          nome de uma variável de ambiente no <strong>Vercel</strong> (ex.{" "}
          <code>GMC_MCP_TOKEN</code> ou <code>env:GMC_MCP_TOKEN</code>) cujo valor é a chave{" "}
          <code>mcp_...</code> — nunca cole o segredo aqui. Para o GMC em{" "}
          <code>/mcp</code>, crie a chave em Admin → API e defina a mesma env no projeto Vercel.
        </p>
        <Input
          label="Nome"
          hint="Identificador único (ex. gmail, supabase)"
          value={mcpName}
          onChange={(e) => setMcpName(e.target.value)}
        />
        <Input
          label="URL do servidor MCP"
          value={mcpUrl}
          onChange={(e) => setMcpUrl(e.target.value)}
          placeholder="https://..."
        />
        <Input
          label="Variável de ambiente (obrigatória para /mcp autenticado)"
          hint="Nome da env var no Vercel, ex. GMC_MCP_TOKEN — o valor deve ser mcp_..."
          value={mcpToken}
          onChange={(e) => setMcpToken(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={mcpSaving || !mcpName.trim() || !mcpUrl.trim()}
          onClick={() => void addMcpConnection()}
        >
          <Plug size={14} />
          {mcpSaving ? "A ligar…" : "Adicionar conector"}
        </Button>
        {mcpConnections.length === 0 ? (
          <p className="text-center text-xs text-slate-400">Nenhum conector configurado.</p>
        ) : (
          <div className="space-y-2">
            {mcpConnections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold text-slate-800">
                    <Link2 size={12} />
                    {conn.name}
                  </p>
                  <p className="truncate text-slate-500">{conn.server_url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={conn.enabled ? "success" : "neutral"}>
                    {conn.enabled ? "Activo" : "Off"}
                  </Badge>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-rose-500"
                    onClick={async () => {
                      await fetch(`/api/agents/${id}/mcp-connections?id=${conn.id}`, {
                        method: "DELETE",
                      });
                      await loadMcpConnections();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab === "versions") {
    return (
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          <p>
            <strong className="text-slate-800">Guardar</strong> — atualiza a versão ativa com as
            alterações atuais (prompt, tools, skills…).
          </p>
          <p>
            <strong className="text-slate-800">Nova versão</strong> — cria um snapshot{" "}
            <code>v+1</code>, torna-o a versão ativa e arquiva a anterior. Use isto quando quiser
            um ponto de restauro.
          </p>
          <p>
            <strong className="text-slate-800">Restaurar</strong> — volta a ativar uma versão
            arquivada.
          </p>
        </div>
        {versions.length === 0 ? (
          <p className="text-center text-xs text-slate-400">Ainda não há versões.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => {
              const isCurrent = v.id === currentVersionId;
              return (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs",
                    isCurrent ? "border-brand-300 bg-brand-50/40" : "border-line"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      v{v.version}
                      {isCurrent ? " · atual" : ""}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {v.published_at
                        ? new Date(v.published_at).toLocaleString("pt-PT")
                        : "Sem data de publicação"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={VERSION_STATUS_TONE[v.status] ?? "neutral"}>
                      {VERSION_STATUS_LABEL[v.status] ?? v.status}
                    </Badge>
                    {v.status === "draft" && !isCurrent && (
                      <Button size="sm" onClick={() => publishVersion(v.id)}>
                        Ativar
                      </Button>
                    )}
                    {v.status === "archived" && (
                      <Button size="sm" variant="outline" onClick={() => rollbackVersion(v.id)}>
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
