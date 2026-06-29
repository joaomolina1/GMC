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
  Key,
  Copy,
  Trash2,
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

type Tab = "users" | "roles" | "audit" | "costs" | "rate-limits" | "api-keys";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  scopes: string[];
  allowed_agent_ids: string[] | null;
  allowed_flow_ids: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

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
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyUserId, setNewKeyUserId] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");

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
    const [uRes, cRes, lRes, rRes, sRes, rolesRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/costs"),
      fetch("/api/admin/audit"),
      fetch("/api/admin/rate-limits"),
      fetch("/api/admin/stats"),
      fetch("/api/admin/roles"),
    ]);

    if ([uRes, cRes, lRes, rRes, sRes, rolesRes].some((res) => res.status === 403)) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const [u, c, l, r, s, rolesData] = await Promise.all([
      uRes.json(),
      cRes.json(),
      lRes.json(),
      rRes.json(),
      sRes.json(),
      rolesRes.json(),
    ]);
    if (Array.isArray(u)) setUsers(u);
    if (Array.isArray(c)) setCosts(c);
    if (Array.isArray(l)) setLogs(l);
    if (Array.isArray(r)) setRateLimits(r);
    if (s && typeof s === "object" && !Array.isArray(s)) setPlatformStats(s);
    if (rolesData?.policies) setRolePolicies(rolesData.policies);
    if (rolesData?.models) setAllModels(rolesData.models);
    setLoading(false);
  }

  async function loadApiKeys() {
    const res = await fetch("/api/admin/platform-api-keys");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setApiKeys(data);
  }

  useEffect(() => {
    loadAll();
    setApiBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (tab === "api-keys") loadApiKeys();
  }, [tab]);

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

  async function createApiKey() {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setCreatedSecret(null);
    const res = await fetch("/api/admin/platform-api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newKeyName.trim(),
        user_id: newKeyUserId || undefined,
      }),
    });
    const data = await res.json();
    setCreatingKey(false);
    if (res.ok && data.secret) {
      setCreatedSecret(data.secret);
      setNewKeyName("");
      setNewKeyUserId("");
      await loadApiKeys();
    }
  }

  async function revokeApiKey(id: string) {
    if (!confirm("Revogar esta API key? Aplicações que a usam deixarão de funcionar.")) return;
    await fetch("/api/admin/platform-api-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "revoke" }),
    });
    await loadApiKeys();
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Utilizadores", icon: Users },
    { id: "roles", label: "Roles & limites", icon: Gauge },
    { id: "api-keys", label: "API Keys", icon: Key },
    { id: "rate-limits", label: "Rate Limits", icon: Shield },
    { id: "audit", label: "Auditoria", icon: ScrollText },
    { id: "costs", label: "Custos", icon: Euro },
  ];

  const roleTone: Record<string, "brand" | "warning" | "neutral"> = {
    super_admin: "brand",
    admin: "brand",
    power_user: "warning",
  };

  return (
    <div className="space-y-6">
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

      {tab === "api-keys" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API externa — agentes e flows</CardTitle>
            </CardHeader>
            <p className="mb-4 text-sm text-slate-500">
              Aplicações externas podem executar agentes ou flows com uma API key. Autenticação via{" "}
              <code className="rounded bg-slate-100 px-1">Authorization: Bearer gmc_live_...</code>{" "}
              ou header <code className="rounded bg-slate-100 px-1">X-API-Key</code>.
            </p>
            <div className="space-y-3 rounded-xl border border-line bg-slate-50/60 p-4 font-mono text-xs text-slate-700">
              <div>
                <p className="mb-1 font-sans text-xs font-medium uppercase text-slate-400">
                  Executar agente
                </p>
                <p>POST {apiBaseUrl}/api/v1/agents/{"{agent_id}"}/run</p>
              </div>
              <div>
                <p className="mb-1 font-sans text-xs font-medium uppercase text-slate-400">
                  Executar flow
                </p>
                <p>POST {apiBaseUrl}/api/v1/flows/{"{flow_id}"}/run</p>
              </div>
              <div>
                <p className="mb-1 font-sans text-xs font-medium uppercase text-slate-400">
                  Corpo (JSON)
                </p>
                <pre className="whitespace-pre-wrap">{`{ "input": "mensagem" }
// ou
{ "input": { "message": "...", "context": { ... } } }`}</pre>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Criar API key</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Nome"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Integração CRM"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Titular (opcional)
                </label>
                <Select
                  value={newKeyUserId}
                  onChange={(e) => setNewKeyUserId(e.target.value)}
                  className="h-10 w-full"
                >
                  <option value="">Eu (admin atual)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={createApiKey} disabled={creatingKey || !newKeyName.trim()}>
                  {creatingKey ? "A criar..." : "Gerar chave"}
                </Button>
              </div>
            </div>
            {createdSecret && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-800">
                  Chave criada — copie agora, não será mostrada novamente:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-white px-3 py-2 text-xs text-slate-800">
                    {createdSecret}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyText(createdSecret)}>
                    <Copy size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card padding="none">
            <div className="px-6 pt-5">
              <CardHeader>
                <CardTitle>Chaves existentes</CardTitle>
              </CardHeader>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-3 font-medium">Nome</th>
                    <th className="px-6 py-3 font-medium">Prefixo</th>
                    <th className="px-6 py-3 font-medium">Titular</th>
                    <th className="px-6 py-3 font-medium">Scopes</th>
                    <th className="px-6 py-3 font-medium">Último uso</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3 font-medium text-slate-800">{k.name}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-600">{k.key_prefix}…</td>
                      <td className="px-6 py-3 text-slate-600">{k.user_email ?? "—"}</td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {(k.scopes ?? []).join(", ")}
                      </td>
                      <td className="px-6 py-3 text-slate-500">
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleString("pt-PT")
                          : "—"}
                      </td>
                      <td className="px-6 py-3">
                        {k.revoked_at ? (
                          <Badge tone="neutral">Revogada</Badge>
                        ) : (
                          <Badge tone="brand">Ativa</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {!k.revoked_at && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revokeApiKey(k.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        Nenhuma API key criada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => (
                  <tr key={String(log.id)} className="hover:bg-slate-50/60">
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
                  </tr>
                ))}
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
                  <th className="px-6 py-3 font-medium">Modelo</th>
                  <th className="px-6 py-3 font-medium">Tokens</th>
                  <th className="px-6 py-3 font-medium">Custo</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {costs.slice(0, 50).map((r) => (
                  <tr key={String(r.id)} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3 font-medium text-slate-700">{String(r.model)}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {Number(r.prompt_tokens) + Number(r.completion_tokens)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{formatCost(Number(r.cost_eur))}</td>
                    <td className="px-6 py-3 text-slate-500">
                      {new Date(String(r.created_at)).toLocaleString("pt-PT")}
                    </td>
                  </tr>
                ))}
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
