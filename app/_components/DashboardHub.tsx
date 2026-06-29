"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Bot,
  MessageSquare,
  Settings2,
  Search,
  Store,
  Sparkles,
} from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Input } from "@/_design_system/Input";
import { QuotaWidget } from "@/_components/QuotaWidget";
import { MarketplaceAgentCard } from "@/_components/MarketplaceAgentCard";
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_SORT_OPTIONS,
  type MarketplaceSort,
} from "@lib/marketplace/constants";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { cn } from "@lib/utils";

type View = "mine" | "public";

interface MyAgent {
  id: string;
  name: string;
  description: string;
  status: string;
  visibility: string;
  updated_at: string;
}

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  published: "success",
  active: "success",
  draft: "warning",
  archived: "neutral",
};

export function DashboardHub({ firstName }: { firstName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view") === "public" ? "public" : "mine";
  const [view, setView] = useState<View>(initialView);
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [publicAgents, setPublicAgents] = useState<MarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<MarketplaceSort>("recent");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/agents");
    const data = await res.json();
    setMyAgents(Array.isArray(data) ? data : []);
  }, []);

  const loadPublic = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    params.set("sort", sort);
    params.set("tab", "all");
    const res = await fetch(`/api/marketplace?${params}`);
    const data = await res.json();
    setPublicAgents(Array.isArray(data) ? data : []);
  }, [q, category, sort]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMine(), loadPublic()]).finally(() => setLoading(false));
  }, [loadMine, loadPublic]);

  useEffect(() => {
    if (view === "public") {
      const timer = setTimeout(() => {
        setLoading(true);
        loadPublic().finally(() => setLoading(false));
      }, q ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [view, loadPublic, q, category, sort]);

  function switchView(next: View) {
    setView(next);
    router.replace(next === "public" ? "/?view=public" : "/", { scroll: false });
  }

  async function toggleFavorite(agentId: string) {
    setActionLoading(`fav-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/favorite`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setPublicAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, is_favorited: data.favorited } : a))
      );
    }
    setActionLoading(null);
  }

  async function toggleFollow(agentId: string) {
    setActionLoading(`follow-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/follow`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setPublicAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, is_following: data.following } : a))
      );
    }
    setActionLoading(null);
  }

  async function cloneAgent(agentId: string) {
    setActionLoading(`clone-${agentId}`);
    const res = await fetch(`/api/marketplace/${agentId}/clone`, { method: "POST" });
    const data = await res.json();
    if (res.ok) router.push(`/agents/${data.agentId}`);
    setActionLoading(null);
  }

  async function seedExamples() {
    setSeeding(true);
    await fetch("/api/agents/seed-examples", { method: "POST" });
    await loadPublic();
    setSeeding(false);
  }

  const filteredMine = myAgents.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q.toLowerCase()) ||
      a.description?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Olá, {firstName}</h2>
          <p className="text-sm text-slate-500">Os seus agentes e o marketplace num só sítio</p>
        </div>
        <Link href="/agents/new">
          <Button>
            <Plus size={16} />
            Novo agente
          </Button>
        </Link>
      </div>

      <QuotaWidget />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchView("mine")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            view === "mine"
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-line bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          <Bot size={16} />
          Os meus agentes
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">{myAgents.length}</span>
        </button>
        <button
          type="button"
          onClick={() => switchView("public")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            view === "public"
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-line bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          <Store size={16} />
          Agentes públicos
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">{publicAgents.length}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={view === "mine" ? "Pesquisar os meus agentes..." : "Pesquisar agentes públicos..."}
            className="pl-9"
          />
        </div>
        {view === "public" && (
          <>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MarketplaceSort)}
              className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
            >
              {MARKETPLACE_SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={seedExamples} disabled={seeding}>
              <Sparkles size={14} />
              {seeding ? "A carregar..." : "Carregar exemplos"}
            </Button>
          </>
        )}
      </div>

      {view === "public" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !category ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            Todos
          </button>
          {MARKETPLACE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === cat.id
                  ? "bg-brand-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse" />
          ))}
        </div>
      ) : view === "mine" ? (
        filteredMine.length === 0 ? (
          <Card className="flex flex-col items-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
              <Bot size={28} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {myAgents.length === 0 ? "Ainda não tem agentes" : "Nenhum resultado"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              {myAgents.length === 0
                ? "Crie o seu primeiro agente ou explore os exemplos públicos."
                : "Tente outra pesquisa."}
            </p>
            {myAgents.length === 0 && (
              <div className="mt-4 flex gap-2">
                <Link href="/agents/new">
                  <Button>
                    <Plus size={16} />
                    Criar agente
                  </Button>
                </Link>
                <Button variant="outline" onClick={() => switchView("public")}>
                  Ver públicos
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredMine.map((agent) => (
              <Card key={agent.id} interactive className="flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Bot size={22} />
                  </div>
                  <div className="flex gap-1">
                    <Badge tone={statusTone[agent.status] ?? "neutral"}>{agent.status}</Badge>
                    {agent.visibility === "public" && <Badge tone="brand">público</Badge>}
                  </div>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{agent.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">
                  {agent.description || "Sem descrição"}
                </p>
                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <Link href={`/agents/${agent.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Settings2 size={15} />
                      Editar
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
        )
      ) : publicAgents.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Store size={32} className="text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Sem agentes públicos</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Publique um agente ou carregue os exemplos oficiais GMC.
          </p>
          <Button className="mt-4" onClick={seedExamples} disabled={seeding}>
            <Sparkles size={16} />
            Carregar exemplos GMC
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publicAgents.map((agent) => (
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
