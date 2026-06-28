"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/_design_system/Button";
import { Input, Textarea } from "@/_design_system/Input";
import { Card } from "@/_design_system/Card";

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "És um assistente de IA do Grupo Media Capital. Responde de forma clara e profissional em português."
  );
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, system_prompt: systemPrompt }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/agents/${data.id}`);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Novo Agente</h2>
      <Card>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Textarea
            label="System Prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="min-h-[200px]"
          />
          <div className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "A criar..." : "Criar Agente"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
