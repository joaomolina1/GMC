"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Euro,
  ScrollText,
  Gauge,
  Shield,
  RefreshCw,
  Bot,
  MessageSquare,
  Zap,
  Store,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Input, Select } from "@/_design_system/Input";
import { formatCost } from "@lib/utils";
import {
  USER_ROLES,
  ROLE_LABELS,
  type RolePolicy,
  type UserRole,
  isUnrestrictedRole,
} from "@lib/enterprise/role-policies";

import {
  AdminConversationDetail,
  type ConversationListItem,
} from "@/_components/AdminConversationDetail";

type Tab = "users" | "roles" | "conversations" | "audit" | "costs" | "rate-limits";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  auth_provider?: string;
}

interface ModelOption {
  id: string;
  display_name: string;
  tier?: string;
  status?: string;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [costs, setCosts] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [rateLimits, setRateLimits] = useState<Array<Record<string, unknown>>>([]);
  const [platformStats, setPlatformStats] = useState<{
    agents: number;
    conversations: number;
    publicAgents: number;
    users: number;
    monthlyCost: number;
    coreSkills: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [rolePolicies, setRolePolicies] = useState<RolePolicy[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole>("user");
  const [savingRole, setSavingRole] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  async function loadRoles() {
    const res = await fetch("/api/admin/roles");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.policies)) setRolePolicies(data.policies);
    if (Array.isArray(data.models)) setAllModels(data.models);
  }

  async function loadAll() {
    setLoading(true);
    setAccessDenied(false);
    const [uRes, cRes, lRes, rRes, sRes, rolesRes, convRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/costs"),
      fetch("/api/admin/audit"),
      fetch("/api/admin/rate-limits"),
      fetch("/api/admin/stats"),
      fetch("/api/admin/roles"),
      fetch("/api/admin/conversations?limit=100"),
    ]);

    if ([uRes, cRes, lRes, rRes, sRes, rolesRes, convRes].some((res) => res.status === 403)) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const [u, c, l, r, s, rolesData, convData] = await Promise.all([
      uRes.json(),
      cRes.json(),
      lRes.json(),
      rRes.json(),
      sRes.json(),
      rolesRes.json(),
      convRes.json(),
    ]);
    if (Array.isArray(u)) setUsers(u);
    if (Array.isArray(c)) setCosts(c);
    if (Array.isArray(l)) setLogs(l);
    if (Array.isArray(r)) setRateLimits(r);
    if (s && typeof s === "object" && !Array.isArray(s)) setPlatformStats(s);
    if (rolesData?.policies) setRolePolicies(rolesData.policies);
    if (rolesData?.models) setAllModels(rolesData.models);
    if (Array.isArray(convData)) setConversations(convData);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function updateRole(userId: string, role: string) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    await loadAll();
  }

  async function saveRolePolicy(policy: RolePolicy) {
    setSavingRole(true);
    await fetch("/api/admin/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    await loadRoles();
    setSavingRole(false);
  }

  const totalCost = costs.reduce((s, row) => s + Number(row.cost_eur ?? 0), 0);
  const activePolicy = rolePolicies.find((p) => p.role === selectedRole);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Utilizadores", icon: Users },
    { id: "roles", label: "Roles & limites", icon: Gauge },
    { id: "conversations", label: "Conversas", icon: MessageSquare },
    { id: "rate-limits", label: "Rate Limits", icon: Shield },
    { id: "audit", label: "Auditoria", icon: ScrollText },
    { id: "costs", label: "Custos", icon: Euro },
  ];

  const filteredConversations = conversations.filter((c) => {
    if (!conversationSearch.trim()) return true;
    const q = conversationSearch.toLowerCase();
    return (
      (c.title ?? "").toLowerCase().includes(q) ||
      (c.user_email ?? "").toLowerCase().includes(q) ||
      (c.agent_name ?? "").toLowerCase().includes(q)
    );
  });

  function conversationIdFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const id = (metadata as { conversationId?: string }).conversationId;
    return id ?? null;
  }

  const roleTone: Record<string, "brand" | "warning" | "neutral"> = {
    super_admin: "brand",
    admin: "brand",
    power_user: "warning",
  };

  return (
    <div className="space-y-6">
      {openConversationId && (
        <AdminConversationDetail
          conversationId={openConversationId}
          onClose={() => setOpenConversationId(null)}
        />
      )}
      {accessDenied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Acesso negado — permissões de administrador necessárias.
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">Backoffice Enterprise</h2>
            <Badge tone="brand">Fase 6</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Utilizadores, quotas, rate limits, auditoria e custos
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-brand-500 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <Users size={16} />
            <p className="text-xs font-medium uppercase">Utilizadores</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {platformStats?.users ?? users.length}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <Bot size={16} />
            <p className="text-xs font-medium uppercase">Agentes</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{platformStats?.agents ?? "—"}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <MessageSquare size={16} />
            <p className="text-xs font-medium uppercase">Conversas</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {platformStats?.conversations ?? "—"}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <Store size={16} />
            <p className="text-xs font-medium uppercase">Públicos</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {platformStats?.publicAgents ?? "—"}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <Zap size={16} />
            <p className="text-xs font-medium uppercase">Skills Core</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{platformStats?.coreSkills ?? 4}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400">
            <Euro size={16} />
            <p className="text-xs font-medium uppercase">Custo (mês)</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatCost(platformStats?.monthlyCost ?? totalCost)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-bold text-slate-900">{logs.length}</p>
          <p className="text-sm text-slate-500">Eventos de auditoria (recentes)</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-slate-900">{formatCost(totalCost)}</p>
          <p className="text-sm text-slate-500">Custo (logs recentes)</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-slate-900">{rateLimits.length}</p>
          <p className="text-sm text-slate-500">Rate limits configurados</p>
        </Card>
      </div>

      {tab === "users" && (
        <Card padding="none">
          <div className="px-6 pt-5">
            <CardHeader>
              <CardTitle>Utilizadores e roles</CardTitle>
            </CardHeader>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Nome</th>
                  <th className="px-6 py-3 font-medium">Auth</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3 text-slate-700">{u.email}</td>
                    <td className="px-6 py-3 text-slate-700">{u.full_name ?? "—"}</td>
                    <td className="px-6 py-3">
                      <Badge tone="neutral">{u.auth_provider ?? "email"}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <Select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        className="h-8 min-w-[120px] text-xs"
                      >
                        <option value="user">user</option>
                        <option value="power_user">power_user</option>
                        <option value="admin">admin</option>
                        <option value="super_admin">super_admin</option>
                        <option value="guest">guest</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "roles" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <Card padding="none">
            <div className="border-b border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Roles</p>
            </div>
            <ul className="p-2">
              {USER_ROLES.map((role) => (
                <li key={role}>
                  <button
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedRole === role
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {ROLE_LABELS[role]}
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                      {role}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {activePolicy && (
            <RolePolicyEditor
              key={activePolicy.role}
              policy={activePolicy}
              models={allModels}
              saving={savingRole}
              onSave={saveRolePolicy}
            />
          )}
        </div>
      )}

      {tab === "rate-limits" && (
        <Card padding="none">
          <div className="px-6 pt-5">
            <CardHeader>
              <CardTitle>Rate limits (req/min)</CardTitle>
            </CardHeader>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Endpoint</th>
                  <th className="px-6 py-3 font-medium">Utilizador</th>
                  <th className="px-6 py-3 font-medium">Limite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rateLimits.map((r) => (
                  <tr key={String(r.id)}>
                    <td className="px-6 py-3 font-mono text-xs text-slate-700">
                      {String(r.endpoint)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {(r.profiles as { email?: string } | null)?.email ?? "Global"}
                    </td>
                    <td className="px-6 py-3 text-slate-700">{String(r.requests_per_minute)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "conversations" && (
        <Card padding="none">
          <div className="flex flex-col gap-3 border-b border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <CardHeader className="!p-0">
              <CardTitle>Conversas</CardTitle>
            </CardHeader>
            <Input
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              placeholder="Pesquisar por título, utilizador ou agente..."
              className="max-w-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Título</th>
                  <th className="px-6 py-3 font-medium">Utilizador</th>
                  <th className="px-6 py-3 font-medium">Agente</th>
                  <th className="px-6 py-3 font-medium">Msgs</th>
                  <th className="px-6 py-3 font-medium">Atualizada</th>
                  <th className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredConversations.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="max-w-[200px] truncate px-6 py-3 font-medium text-slate-800">
                      {c.title || <span className="text-slate-400 italic">Sem título</span>}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {c.user_name ?? c.user_email ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{c.agent_name ?? "—"}</td>
                    <td className="px-6 py-3 text-slate-600">{c.message_count}</td>
                    <td className="px-6 py-3 text-slate-500">
                      {new Date(c.updated_at).toLocaleString("pt-PT")}
                    </td>
                    <td className="px-6 py-3">
                      <Button size="sm" variant="outline" onClick={() => setOpenConversationId(c.id)}>
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredConversations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Sem conversas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "audit" && (
        <Card padding="none">
          <div className="px-6 pt-5">
            <CardHeader>
              <CardTitle>Registo de auditoria</CardTitle>
            </CardHeader>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Ação</th>
                  <th className="px-6 py-3 font-medium">Entidade</th>
                  <th className="px-6 py-3 font-medium">Ator</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => {
                  const logId = String(log.id);
                  const expanded = expandedAuditId === logId;
                  const metadata = log.metadata as Record<string, unknown> | undefined;
                  const convId = metadata?.conversationId as string | undefined;

                  return (
                    <>
                      <tr key={logId} className="hover:bg-slate-50/60">
                        <td className="px-6 py-3 font-medium text-slate-800">{String(log.action)}</td>
                        <td className="px-6 py-3 text-slate-600">
                          {String(log.entity_type)}
                          {log.entity_id ? ` · ${String(log.entity_id).slice(0, 8)}…` : ""}
                        </td>
                        <td className="px-6 py-3 text-slate-600">
                          {(log.profiles as { email?: string } | null)?.email ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-slate-500">
                          {new Date(String(log.created_at)).toLocaleString("pt-PT")}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-2">
                            {metadata && Object.keys(metadata).length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedAuditId(expanded ? null : logId)}
                              >
                                {expanded ? "Ocultar" : "Detalhes"}
                              </Button>
                            )}
                            {convId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setOpenConversationId(convId)}
                              >
                                Conversa
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && metadata && (
                        <tr key={`${logId}-meta`}>
                          <td colSpan={5} className="bg-slate-50 px-6 py-3">
                            <pre className="overflow-x-auto rounded-lg border border-line bg-white p-3 text-xs text-slate-700">
                              {JSON.stringify(metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      Sem eventos de auditoria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "costs" && (
        <Card padding="none">
          <div className="px-6 pt-5">
            <CardHeader>
              <CardTitle>Registos de utilização</CardTitle>
            </CardHeader>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Utilizador</th>
                  <th className="px-6 py-3 font-medium">Modelo</th>
                  <th className="px-6 py-3 font-medium">Tokens</th>
                  <th className="px-6 py-3 font-medium">Custo</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {costs.slice(0, 50).map((r) => {
                  const convId = conversationIdFromMetadata(r.metadata);
                  return (
                    <tr key={String(r.id)} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3 text-slate-600">
                        {(r.profiles as { email?: string } | null)?.email ?? "—"}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-700">{String(r.model)}</td>
                      <td className="px-6 py-3 text-slate-600">
                        {Number(r.prompt_tokens) + Number(r.completion_tokens)}
                      </td>
                      <td className="px-6 py-3 text-slate-600">{formatCost(Number(r.cost_eur))}</td>
                      <td className="px-6 py-3 text-slate-500">
                        {new Date(String(r.created_at)).toLocaleString("pt-PT")}
                      </td>
                      <td className="px-6 py-3">
                        {convId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenConversationId(convId)}
                          >
                            Ver conversa
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RolePolicyEditor({
  policy,
  models,
  saving,
  onSave,
}: {
  policy: RolePolicy;
  models: ModelOption[];
  saving: boolean;
  onSave: (policy: RolePolicy) => void;
}) {
  const unrestricted = isUnrestrictedRole(policy.role);
  const [tokens, setTokens] = useState(
    policy.monthly_token_limit != null ? String(policy.monthly_token_limit) : ""
  );
  const [cost, setCost] = useState(
    policy.monthly_cost_limit_eur != null ? String(policy.monthly_cost_limit_eur) : ""
  );
  const [unlimited, setUnlimited] = useState(
    policy.monthly_token_limit == null && policy.monthly_cost_limit_eur == null
  );
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(policy.allowed_model_ids)
  );
  const [allModelsAllowed, setAllModelsAllowed] = useState(
    unrestricted || policy.allowed_model_ids.length === 0
  );

  function toggleModel(id: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAllModelsAllowed(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ROLE_LABELS[policy.role]}</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-slate-500">
        Limites e modelos aplicam-se a todos os utilizadores com role{" "}
        <code className="rounded bg-slate-100 px-1">{policy.role}</code>.
      </p>

      <div className="space-y-5">
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
            />
            Quota ilimitada
          </label>
          {!unlimited && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Limite tokens / mês"
                type="number"
                value={tokens}
                onChange={(e) => setTokens(e.target.value)}
                placeholder="500000"
              />
              <Input
                label="Limite custo (€) / mês"
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="50.00"
              />
            </div>
          )}
        </div>

        <div className="border-t border-line pt-5">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allModelsAllowed || unrestricted}
              disabled={unrestricted}
              onChange={(e) => {
                setAllModelsAllowed(e.target.checked);
                if (e.target.checked) setSelectedModels(new Set());
              }}
            />
            {unrestricted
              ? "Todos os modelos (admin tem acesso total)"
              : "Todos os modelos ativos"}
          </label>

          {!allModelsAllowed && !unrestricted && (
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-3">
              {models.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.has(m.id)}
                    onChange={() => toggleModel(m.id)}
                  />
                  <span className="font-medium text-slate-800">{m.display_name}</span>
                  <span className="text-xs text-slate-400">{m.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button
          disabled={saving}
          onClick={() =>
            onSave({
              role: policy.role,
              monthly_token_limit: unlimited
                ? null
                : tokens
                  ? Number(tokens)
                  : null,
              monthly_cost_limit_eur: unlimited
                ? null
                : cost
                  ? Number(cost)
                  : null,
              allowed_model_ids:
                allModelsAllowed || unrestricted ? [] : Array.from(selectedModels),
            })
          }
        >
          {saving ? "A guardar..." : "Guardar política do role"}
        </Button>
      </div>
    </Card>
  );
}
