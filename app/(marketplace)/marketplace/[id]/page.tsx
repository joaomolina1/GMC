"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Copy,
  Download,
  Heart,
  MessageSquare,
  Star,
  UserPlus,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Avatar } from "@/_design_system/Avatar";
import { getCategoryLabel } from "@lib/marketplace/constants";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { cn } from "@lib/utils";

type AgentDetail = MarketplaceAgent & {
  version: number | null;
  published_at: string | null;
};

export default function MarketplaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/marketplace/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.id) setAgent(d);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleFavorite() {
    if (!agent) return;
    setActionLoading("favorite");
    const res = await fetch(`/api/marketplace/${id}/favorite`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setAgent({ ...agent, is_favorited: data.favorited });
    setActionLoading(null);
  }

  async function toggleFollow() {
    if (!agent) return;
    setActionLoading("follow");
    const res = await fetch(`/api/marketplace/${id}/follow`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setAgent({ ...agent, is_following: data.following });
    setActionLoading(null);
  }

  async function cloneAgent() {
    setActionLoading("clone");
    const res = await fetch(`/api/marketplace/${id}/clone`, { method: "POST" });
    const data = await res.json();
    if (res.ok) router.push(`/agents/${data.agentId}`);
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <Card className="h-80 animate-pulse" />
      </div>
    );
  }

  if (!agent) {
    return (
      <Card className="py-16 text-center">
        <p className="text-slate-500">Agente não encontrado no marketplace.</p>
        <Link href="/marketplace" className="mt-4 inline-block">
          <Button variant="outline">Voltar ao marketplace</Button>
        </Link>
      </Card>
    );
  }

  const ownerName = agent.owner?.full_name ?? "Utilizador GMC";

  return (
    <div className="space-y-6">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Marketplace
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              {agent.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agent.image_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <Bot size={28} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900">{agent.name}</h2>
                <Badge tone="brand">{getCategoryLabel(agent.category)}</Badge>
              </div>
              <p className="mt-2 text-slate-600">
                {agent.description || "Sem descrição disponível."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {agent.tags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-6 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Downloads</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-lg font-semibold text-slate-800">
                <Download size={16} />
                {agent.downloads}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rating</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-lg font-semibold text-slate-800">
                <Star size={16} />
                {agent.rating.toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Versão</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">v{agent.version ?? 1}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Modelo</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                {agent.model?.replace("claude-", "") ?? "—"}
              </p>
            </div>
          </div>

        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800">Criador</h3>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={ownerName} src={agent.owner?.avatar_url} size="lg" />
              <div>
                <p className="font-medium text-slate-900">{ownerName}</p>
                {agent.published_at && (
                  <p className="text-xs text-slate-400">
                    Publicado em{" "}
                    {new Date(agent.published_at).toLocaleDateString("pt-PT")}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <Link href={`/agents/${agent.id}/chat`}>
              <Button className="w-full">
                <MessageSquare size={16} />
                Experimentar
              </Button>
            </Link>

            {!agent.is_owner && (
              <Button
                className="w-full"
                variant="secondary"
                disabled={actionLoading === "clone"}
                onClick={cloneAgent}
              >
                <Copy size={16} />
                {actionLoading === "clone" ? "A clonar..." : "Clonar para a minha conta"}
              </Button>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={actionLoading === "favorite"}
                onClick={toggleFavorite}
              >
                <Heart
                  size={16}
                  className={cn(agent.is_favorited && "fill-rose-500 text-rose-500")}
                />
                {agent.is_favorited ? "Favorito" : "Favoritar"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={actionLoading === "follow"}
                onClick={toggleFollow}
              >
                <UserPlus size={16} />
                {agent.is_following ? "A seguir" : "Seguir"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
