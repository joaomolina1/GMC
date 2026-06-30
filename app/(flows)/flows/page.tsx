"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Workflow, Play, Settings2 } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";

interface Flow {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  published: "success",
  draft: "warning",
  archived: "neutral",
};

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d) => setFlows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  async function seedExamples() {
    setSeeding(true);
    const res = await fetch("/api/flows/seed-examples", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const list = await fetch("/api/flows").then((r) => r.json());
      setFlows(Array.isArray(list) ? list : []);
    } else {
      alert(data.error ?? "Erro ao criar exemplos");
    }
    setSeeding(false);
  }

  function flowCategory(description: string): string | null {
    const match = description.match(/Categoria:\s*(\w+)/i);
    return match ? match[1] : null;
  }

  async function createFlow() {
    setCreating(true);
    const res = await fetch("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo Flow" }),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      window.location.href = `/flows/${data.id}`;
    }
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-brand-500 to-accent-500 p-6 text-white shadow-[var(--shadow-card)] sm:p-8">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge tone="brand" className="bg-white/20 text-white ring-white/30">
              Fase 5
            </Badge>
            <h2 className="mt-2 text-2xl font-bold">Flow Builder</h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              Orquestre agentes de IA com workflows visuais — triggers, condições e outputs encadeados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={seedExamples}
              disabled={seeding}
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
            >
              {seeding ? "A criar..." : "Carregar exemplos"}
            </Button>
            <Button
              onClick={createFlow}
              disabled={creating}
              className="bg-white text-brand-700 hover:bg-white/90"
            >
              <Plus size={16} />
              {creating ? "A criar..." : "Novo flow"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
            <Workflow size={32} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">Ainda não tem flows</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Crie o seu primeiro workflow para automatizar sequências de agentes.
          </p>
          <Button onClick={createFlow} disabled={creating} className="mt-5">
            <Plus size={16} />
            Criar flow
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} interactive className="flex h-full flex-col">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Workflow size={22} />
                </div>
                <Badge tone={statusTone[flow.status] ?? "neutral"}>{flow.status}</Badge>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{flow.name}</h3>
              {flowCategory(flow.description) && (
                <Badge tone="neutral" className="mt-2">
                  {flowCategory(flow.description)}
                </Badge>
              )}
              <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">
                {flow.description || "Sem descrição"}
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
                <Link href={`/flows/${flow.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings2 size={15} />
                    Editar
                  </Button>
                </Link>
                <Link href={`/flows/${flow.id}?run=1`} className="flex-1">
                  <Button size="sm" className="w-full">
                    <Play size={15} />
                    Executar
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
