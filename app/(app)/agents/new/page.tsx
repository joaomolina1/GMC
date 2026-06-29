"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";
import { Card } from "@/_design_system/Card";

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/agents/${data.id}`);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Bot size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Novo agente</h2>
          <p className="text-sm text-slate-500">
            Dê um nome — configure o prompt e teste no editor a seguir
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleCreate} className="space-y-5">
          <Input
            label="Nome"
            placeholder="Ex.: Assistente de Imprensa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="flex gap-3 border-t border-line pt-5">
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "A criar..." : "Criar e configurar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
