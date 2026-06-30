"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, MessagesSquare, Trash2 } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { cn } from "@lib/utils";
import type { ConversationListItem } from "@lib/chat/conversations";

interface ConversationHistorySidebarProps {
  agentId: string;
  activeConversationId?: string;
  onSelect: (conversationId: string | undefined) => void;
  refreshKey?: number;
  className?: string;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `há ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

export function ConversationHistorySidebar({
  agentId,
  activeConversationId,
  onSelect,
  refreshKey = 0,
  className,
}: ConversationHistorySidebarProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?agentId=${agentId}`);
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations, refreshKey]);

  async function deleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm("Eliminar esta conversa?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeConversationId === id) onSelect(undefined);
    await loadConversations();
  }

  return (
    <aside
      className={cn(
        "flex w-[min(240px,28%)] shrink-0 flex-col border-r border-line bg-slate-50/60",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <MessagesSquare size={15} className="shrink-0 text-slate-500" />
          <span className="truncate text-xs font-semibold text-slate-700">Histórico</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={() => onSelect(undefined)}
          title="Nova conversa"
        >
          <MessageSquarePlus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-200/70" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-slate-400">
            Ainda sem conversas guardadas. As conversas com mais de 60 dias são removidas
            automaticamente.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    className={cn(
                      "group flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                      active
                        ? "bg-white shadow-sm ring-1 ring-brand-200"
                        : "hover:bg-white/80"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "line-clamp-2 text-xs font-medium",
                          active ? "text-brand-800" : "text-slate-700"
                        )}
                      >
                        {conv.title?.trim() || "Conversa sem título"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {formatRelativeTime(conv.updated_at)} · {conv.message_count} msg
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => void deleteConversation(e, conv.id)}
                      className="mt-0.5 shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                      title="Eliminar conversa"
                    >
                      <Trash2 size={12} />
                    </button>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
