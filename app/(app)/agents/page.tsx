"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Bot, MessageSquare, Settings2 } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  published: "success",
  active: "success",
  draft: "warning",
  archived: "neutral",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Os meus agentes</h2>
          <p className="text-sm text-slate-500">Gerir e configurar agentes de IA</p>
        </div>
        <Link href="/agents/new">
          <Button>
            <Plus size={16} />
            Novo agente
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse">
              <div className="h-11 w-11 rounded-xl bg-slate-100" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-full rounded bg-slate-100" />
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <Bot size={32} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">Ainda não tem agentes</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Crie o seu primeiro agente de IA para começar a automatizar tarefas e conversas.
          </p>
          <Link href="/agents/new" className="mt-5">
            <Button>
              <Plus size={16} />
              Criar agente
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} interactive className="flex h-full flex-col">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Bot size={22} />
                </div>
                <Badge tone={statusTone[agent.status] ?? "neutral"}>{agent.status}</Badge>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{agent.name}</h3>
              <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">
                {agent.description || "Sem descrição"}
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
                <Link href={`/agents/${agent.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings2 size={15} />
                    Configurar
                  </Button>
                </Link>
                <Link href={`/agents/${agent.id}/chat`} className="flex-1">
                  <Button size="sm" className="w-full">
                    <MessageSquare size={15} />
                    Chat
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
