"use client";

import { useEffect, useState } from "react";
import { X, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Badge } from "@/_design_system/Badge";
import { formatCost } from "@lib/utils";
import { cn } from "@lib/utils";

interface ConversationListItem {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_name: string | null;
  agent_name: string | null;
  message_count: number;
}

interface ConversationMessage {
  id: string;
  role: string;
  text: string;
  model: string | null;
  cost_eur: number | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  created_at: string;
}

interface ConversationDetail {
  conversation: {
    id: string;
    title: string | null;
    user_email: string | null;
    user_name: string | null;
    agent_name: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: ConversationMessage[];
  usage_logs: Array<Record<string, unknown>>;
}

export function AdminConversationDetail({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/conversations/${conversationId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao carregar");
        setDetail(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {detail?.conversation.title || "Conversa"}
            </h3>
            {detail && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {detail.conversation.user_name ?? detail.conversation.user_email} ·{" "}
                {detail.conversation.agent_name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          )}
          {detail && !loading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>Criada: {new Date(detail.conversation.created_at).toLocaleString("pt-PT")}</span>
                <span>·</span>
                <span>Atualizada: {new Date(detail.conversation.updated_at).toLocaleString("pt-PT")}</span>
                <span>·</span>
                <span>{detail.messages.length} mensagens</span>
              </div>

              {detail.messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400">Sem mensagens nesta conversa.</p>
              ) : (
                <div className="space-y-3">
                  {detail.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-xl border p-3",
                        msg.role === "user"
                          ? "border-brand-100 bg-brand-50/50"
                          : "border-line bg-slate-50"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {msg.role === "user" ? (
                          <User size={14} className="text-brand-600" />
                        ) : (
                          <Bot size={14} className="text-slate-500" />
                        )}
                        <Badge tone={msg.role === "user" ? "brand" : "neutral"}>{msg.role}</Badge>
                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.created_at).toLocaleString("pt-PT")}
                        </span>
                        {msg.model && (
                          <span className="ml-auto text-[10px] text-slate-400">{msg.model}</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                        {msg.text || <em className="text-slate-400">(vazio)</em>}
                      </p>
                      {(msg.cost_eur || msg.tokens_prompt) && (
                        <p className="mt-2 text-[10px] text-slate-400">
                          {msg.tokens_prompt != null && `${msg.tokens_prompt} in`}
                          {msg.tokens_completion != null && ` / ${msg.tokens_completion} out tokens`}
                          {msg.cost_eur != null && ` · ${formatCost(Number(msg.cost_eur))}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detail.usage_logs.length > 0 && (
                <div className="border-t border-line pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                    Registos de utilização
                  </p>
                  <ul className="space-y-2">
                    {detail.usage_logs.map((log) => {
                      const meta = (log.metadata ?? {}) as Record<string, number | string | undefined>;
                      const cacheRead = Number(meta.cache_read_input_tokens ?? 0);
                      const cacheCreate = Number(meta.cache_creation_input_tokens ?? 0);
                      const fresh = Number(meta.fresh_input_tokens ?? 0);
                      return (
                      <li
                        key={String(log.id)}
                        className="rounded-lg border border-line px-3 py-2 text-xs text-slate-600"
                      >
                        {String(log.model)} ·{" "}
                        {Number(log.prompt_tokens) + Number(log.completion_tokens)} tokens ·{" "}
                        {formatCost(Number(log.cost_eur))} ·{" "}
                        {new Date(String(log.created_at)).toLocaleString("pt-PT")}
                        {(cacheRead > 0 || cacheCreate > 0) && (
                          <span className="mt-1 block text-[10px] text-emerald-700">
                            cache: {cacheRead} lidos · {cacheCreate} criados · {fresh} fresh
                            {meta.route ? ` · rota ${meta.route}` : ""}
                          </span>
                        )}
                      </li>
                    )})}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line p-4">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { ConversationListItem };
