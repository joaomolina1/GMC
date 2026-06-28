"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Bot } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Agentes</h2>
          <p className="text-gray-500">Gerir e configurar agentes de IA</p>
        </div>
        <Link href="/agents/new">
          <Button>
            <Plus size={16} />
            Novo Agente
          </Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">A carregar...</p>
      ) : agents.length === 0 ? (
        <Card className="text-center">
          <Bot size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Ainda não tem agentes. Crie o primeiro!</p>
          <Link href="/agents/new" className="mt-4 inline-block">
            <Button>Criar Agente</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0066B3]/10 text-[#0066B3]">
                    <Bot size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{agent.description || "Sem descrição"}</p>
                    <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {agent.status}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
