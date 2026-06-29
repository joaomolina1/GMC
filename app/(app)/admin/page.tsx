"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Backoffice</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Utilizadores</CardTitle></CardHeader>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Custo Total</CardTitle></CardHeader>
          <p className="text-3xl font-bold text-gray-900">{formatCost(totalCost)}</p>
        </Card>
        <Card>
          <CardHeader><CardTitle>Eventos Audit</CardTitle></CardHeader>
          <p className="text-3xl font-bold text-gray-900">{logs.length}</p>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Utilizadores</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Nome</th>
                <th className="pb-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={String(u.id)} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{String(u.email)}</td>
                  <td className="py-2 pr-4">{String(u.full_name ?? "—")}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{String(u.role)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usage Logs</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">Modelo</th>
                <th className="pb-2 pr-4">Tokens</th>
                <th className="pb-2 pr-4">Custo</th>
                <th className="pb-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {costs.slice(0, 20).map((r) => (
                <tr key={String(r.id)} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{String(r.model)}</td>
                  <td className="py-2 pr-4">
                    {Number(r.prompt_tokens) + Number(r.completion_tokens)}
                  </td>
                  <td className="py-2 pr-4">{formatCost(Number(r.cost_eur))}</td>
                  <td className="py-2">{new Date(String(r.created_at)).toLocaleString("pt-PT")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
