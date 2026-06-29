"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store, Heart, UserPlus } from "lucide-react";
import { Input } from "@/_design_system/Input";
import { Badge } from "@/_design_system/Badge";
import { Card } from "@/_design_system/Card";
import { MarketplaceAgentCard } from "@/_components/MarketplaceAgentCard";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SORT_OPTIONS,
  type MarketplaceSort,
  type MarketplaceTab,
} from "@lib/marketplace/constants";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { cn } from "@lib/utils";

const TABS: { id: MarketplaceTab; label: string; icon: typeof Store }[] = [
  { id: "all", label: "Todos", icon: Store },
  { id: "favorites", label: "Favoritos", icon: Heart },
  { id: "following", label: "A seguir", icon: UserPlus },
];

export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<MarketplaceSort>("recent");
  const [tab, setTab] = useState<MarketplaceTab>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    params.set("sort", sort);
    params.set("tab", tab);

    const res = await fetch(`/api/marketplace?${params}`);
    const data = await res.json();
    setAgents(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, category, sort, tab]);

  useEffect(() => {
    const timer = setTimeout(loadAgents, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadAgents, q]);

  async function toggleFavorite(agentId: string) {
    setActionLoading(`fav-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/favorite`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, is_favorited: data.favorited } : a
        )
      );
    }
    setActionLoading(null);
  }

  async function toggleFollow(agentId: string) {
    setActionLoading(`follow-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/follow`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, is_following: data.following } : a
        )
      );
    }
    setActionLoading(null);
  }

  async function cloneAgent(agentId: string) {
    setActionLoading(`clone-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/clone`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      router.push(`/agents/${data.agentId}`);
    }
    setActionLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 p-6 text-white shadow-[var(--shadow-card)] sm:p-8">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <Badge tone="brand" className="bg-white/20 text-white ring-white/30">
            Fase 3
          </Badge>
          <h2 className="mt-3 text-2xl font-bold">Marketplace de Agentes</h2>
          <p className="mt-1 max-w-xl text-sm text-white/85">
            Descubra, experimente e clone agentes publicados pela equipa do Grupo Media Capital.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                tab === id
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Pesquisar agentes..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as MarketplaceSort)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            {MARKETPLACE_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            !category
              ? "bg-brand-500 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          Todas
        </button>
        {MARKETPLACE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              category === cat.id
                ? "bg-brand-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-64 animate-pulse">
              <div className="h-11 w-11 rounded-xl bg-slate-100" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-full rounded bg-slate-100" />
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <Store size={32} />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">
            {tab === "all"
              ? "Nenhum agente publicado"
              : tab === "favorites"
                ? "Sem favoritos"
                : "Não segue nenhum agente"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {tab === "all"
              ? "Publique um agente com visibilidade pública para aparecer aqui."
              : tab === "favorites"
                ? "Adicione agentes aos favoritos para os encontrar rapidamente."
                : "Siga criadores para acompanhar os seus agentes."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <MarketplaceAgentCard
              key={agent.id}
              agent={agent}
              onFavorite={toggleFavorite}
              onFollow={toggleFollow}
              onClone={cloneAgent}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
