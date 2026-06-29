"use client";

import Link from "next/link";
import {
  Bot,
  Heart,
  UserPlus,
  Copy,
  MessageSquare,
  Download,
  Star,
} from "lucide-react";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Avatar } from "@/_design_system/Avatar";
import { getCategoryLabel } from "@lib/marketplace/constants";
import type { MarketplaceAgent } from "@lib/marketplace/types";
import { cn } from "@lib/utils";

interface MarketplaceAgentCardProps {
  agent: MarketplaceAgent;
  onFavorite?: (id: string) => void;
  onFollow?: (id: string) => void;
  onClone?: (id: string) => void;
  actionLoading?: string | null;
}

export function MarketplaceAgentCard({
  agent,
  onFavorite,
  onFollow,
  onClone,
  actionLoading,
}: MarketplaceAgentCardProps) {
  const ownerName = agent.owner?.full_name ?? "Utilizador GMC";

  return (
    <Card interactive className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {agent.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.image_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <Bot size={22} />
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onFavorite?.(agent.id);
            }}
            disabled={actionLoading === `fav-${agent.id}`}
            className={cn(
              "rounded-lg p-2 transition-colors",
              agent.is_favorited
                ? "text-rose-500 hover:bg-rose-50"
                : "text-slate-400 hover:bg-slate-50 hover:text-rose-500"
            )}
            title={agent.is_favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Heart size={16} className={agent.is_favorited ? "fill-current" : ""} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onFollow?.(agent.id);
            }}
            disabled={actionLoading === `follow-${agent.id}`}
            className={cn(
              "rounded-lg p-2 transition-colors",
              agent.is_following
                ? "text-brand-600 hover:bg-brand-50"
                : "text-slate-400 hover:bg-slate-50 hover:text-brand-600"
            )}
            title={agent.is_following ? "Deixar de seguir" : "Seguir"}
          >
            <UserPlus size={16} />
          </button>
        </div>
      </div>

      <Link href={`/marketplace/${agent.id}`} className="mt-4 block flex-1">
        <h3 className="font-semibold text-slate-900">{agent.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
          {agent.description || "Sem descrição"}
        </p>
      </Link>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="brand">{getCategoryLabel(agent.category)}</Badge>
        {agent.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Download size={12} />
          {agent.downloads}
        </span>
        <span className="inline-flex items-center gap-1">
          <Star size={12} />
          {agent.rating.toFixed(1)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 truncate">
          <Avatar name={ownerName} size="sm" />
          <span className="truncate">{ownerName}</span>
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        <Link href={`/agents/${agent.id}/chat`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            <MessageSquare size={15} />
            Experimentar
          </Button>
        </Link>
        {!agent.is_owner && (
          <Button
            size="sm"
            className="flex-1"
            disabled={actionLoading === `clone-${agent.id}`}
            onClick={() => onClone?.(agent.id)}
          >
            <Copy size={15} />
            {actionLoading === `clone-${agent.id}` ? "A clonar..." : "Clonar"}
          </Button>
        )}
      </div>
    </Card>
  );
}
