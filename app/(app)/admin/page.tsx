"use client";

import { useEffect, useState } from "react";
import { Users, Euro, ScrollText } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { formatCost } from "@lib/utils";

export default function AdminPage() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [costs, setCosts] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/costs").then((r) => r.json()),
      fetch("/api/admin/logs").then((r) => r.json()),
    ]).then(([u, c, l]) => {
      if (Array.isArray(u)) setUsers(u);
      if (Array.isArray(c)) setCosts(c);
      if (Array.isArray(l)) setLogs(l);
    });
  }, []);

  const totalCost = costs.reduce((s, r) => s + Number(r.cost_eur ?? 0), 0);

  const stats = [
    { label: "Utilizadores", value: users.length, icon: Users, tone: "bg-brand-50 text-brand-600" },
    { label: "Custo total", value: formatCost(totalCost), icon: Euro, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Eventos audit", value: logs.length, icon: ScrollText, tone: "bg-violet-50 text-violet-600" },
  ];

  const roleTone: Record<string, "brand" | "warning" | "neutral"> = {
    super_admin: "brand",
    admin: "brand",
    editor: "warning",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Backoffice</h2>
        <p className="text-sm text-slate-500">Administração, utilizadores e métricas de utilização</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
                <Icon size={22} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-sm text-slate-500">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card padding="none">
        <div className="px-6 pt-5">
          <CardHeader>
            <CardTitle>Utilizadores</CardTitle>
          </CardHeader>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={String(u.id)} className="transition-colors hover:bg-slate-50/60">
                  <td className="px-6 py-3 text-slate-700">{String(u.email)}</td>
                  <td className="px-6 py-3 text-slate-700">{String(u.full_name ?? "—")}</td>
                  <td className="px-6 py-3">
                    <Badge tone={roleTone[String(u.role)] ?? "neutral"}>{String(u.role)}</Badge>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                    Sem utilizadores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
              {costs.slice(0, 20).map((r) => (
                <tr key={String(r.id)} className="transition-colors hover:bg-slate-50/60">
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
              {costs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    Sem registos de utilização.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
