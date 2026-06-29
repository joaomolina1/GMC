"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { AgentChatPanel } from "@/_components/AgentChatPanel";

export default function AgentChatPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const [agentName, setAgentName] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((d) => setAgentName(d.name));
  }, [agentId]);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/agents/${agentId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <h2 className="text-sm font-semibold text-slate-900">{agentName || "Agente"}</h2>
      </div>
      <AgentChatPanel agentId={agentId} agentName={agentName} className="flex-1" />
    </div>
  );
}
