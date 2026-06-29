"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Euro,
  ScrollText,
  Gauge,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Input, Select } from "@/_design_system/Input";
import { formatCost } from "@lib/utils";

type Tab = "users" | "quotas" | "audit" | "costs" | "rate-limits";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  auth_provider?: string;
  user_quotas?: Array<{
    monthly_token_limit: number | null;
    monthly_cost_limit_eur: number | null;
  }>;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [costs, setCosts] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [rateLimits, setRateLimits] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  async function loadAll() {
    setLoading(true);
    setAccessDenied(false);
    const [uRes, cRes, lRes, rRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/costs"),
      fetch("/api/admin/audit"),
      fetch("/api/admin/rate-limits"),
    ]);

    if ([uRes, cRes, lRes, rRes].some((res) => res.status === 403)) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const [u, c, l, r] = await Promise.all([
      uRes.json(),
      cRes.json(),
      lRes.json(),
      rRes.json(),
    ]);
    if (Array.isArray(u)) setUsers(u);
    if (Array.isArray(c)) setCosts(c);
    if (Array.isArray(l)) setLogs(l);
    if (Array.isArray(r)) setRateLimits(r);
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

  async function updateQuota(
    userId: string,
    monthly_token_limit: number | null,
    monthly_cost_limit_eur: number | null
  ) {
    await fetch("/api/admin/quotas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, monthly_token_limit, monthly_cost_limit_eur }),
    });
    await loadAll();
  }

  const totalCost = costs.reduce((s, row) => s + Number(row.cost_eur ?? 0), 0);

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Utilizadores", icon: Users },
    { id: "quotas", label: "Quotas", icon: Gauge },
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-bold text-slate-900">{users.length}</p>
          <p className="text-sm text-slate-500">Utilizadores</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-slate-900">{formatCost(totalCost)}</p>
          <p className="text-sm text-slate-500">Custo (logs recentes)</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-slate-900">{logs.length}</p>
          <p className="text-sm text-slate-500">Eventos de auditoria</p>
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

      {tab === "quotas" && (
        <Card padding="none">
          <div className="px-6 pt-5">
            <CardHeader>
              <CardTitle>Quotas mensais</CardTitle>
            </CardHeader>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3 font-medium">Utilizador</th>
                  <th className="px-6 py-3 font-medium">Limite tokens</th>
                  <th className="px-6 py-3 font-medium">Limite custo (€)</th>
                  <th className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const q = u.user_quotas?.[0];
                  return (
                    <QuotaRow
                      key={u.id}
                      email={u.email}
                      tokenLimit={q?.monthly_token_limit ?? 500000}
                      costLimit={q?.monthly_cost_limit_eur ?? 50}
                      onSave={(tokens, cost) => updateQuota(u.id, tokens, cost)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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

function QuotaRow({
  email,
  tokenLimit,
  costLimit,
  onSave,
}: {
  email: string;
  tokenLimit: number;
  costLimit: number;
  onSave: (tokens: number | null, cost: number | null) => void;
}) {
  const [tokens, setTokens] = useState(String(tokenLimit));
  const [cost, setCost] = useState(String(costLimit));

  return (
    <tr>
      <td className="px-6 py-3 text-slate-700">{email}</td>
      <td className="px-6 py-3">
        <Input
          type="number"
          value={tokens}
          onChange={(e) => setTokens(e.target.value)}
          className="h-8 w-32 text-xs"
        />
      </td>
      <td className="px-6 py-3">
        <Input
          type="number"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="h-8 w-24 text-xs"
        />
      </td>
      <td className="px-6 py-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onSave(tokens ? Number(tokens) : null, cost ? Number(cost) : null)
          }
        >
          Guardar
        </Button>
      </td>
    </tr>
  );
}
