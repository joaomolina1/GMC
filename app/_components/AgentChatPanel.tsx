"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Avatar } from "@/_design_system/Avatar";
import { cn } from "@lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatPanelProps {
  agentId: string;
  agentName?: string;
  className?: string;
  compact?: boolean;
}

export function AgentChatPanel({
  agentId,
  agentName = "Agente",
  className,
  compact = false,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState<
    Array<{ storage_path: string; filename: string; mime: string; kind: string }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) setAttachments((prev) => [...prev, data]);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;

    const userMsg = input.trim();
    const currentAttachments = [...attachments];
    setInput("");
    setAttachments([]);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          conversationId,
          message: userMsg,
          attachments: currentAttachments,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ?? `Erro ${res.status}: pedido rejeitado`
        );
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";

        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          let data: {
            type?: string;
            text?: string;
            message?: string;
            name?: string;
            conversationId?: string;
          };
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (data.type === "error") {
            throw new Error(data.message ?? "Erro no streaming");
          }
          if (data.type === "text" && data.text) {
            assistantContent += data.text;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              return updated;
            });
          }
          if (data.type === "done" && data.conversationId) {
            setConversationId(data.conversationId);
          }
          if (data.type === "server_tool" && data.name) {
            assistantContent += `\n\n\u{1F50D} *A pesquisar na web…*\n`;
          }
        }
      }

      if (!assistantContent.trim()) {
        throw new Error(
          "O agente não devolveu resposta. Guarde o agente e verifique ANTHROPIC_API_KEY."
        );
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Erro: ${err instanceof Error ? err.message : "Falha no streaming"}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  const suggestions = compact
    ? ["Olá!", "Resume este texto", "Pesquisa na web"]
    : ["Resume este documento", "Pesquisa as últimas notícias", "O que vês nesta imagem?"];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Bot size={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{agentName}</h3>
            <p className="text-xs text-slate-400">Testar agente</p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-sm">
                <Sparkles size={26} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                A conversa aparece aqui
              </h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Teste o agente com o prompt à esquerda. Guarde antes de testar alterações.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Bot size={14} />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-md bg-brand-500 text-white"
                    : "rounded-bl-md bg-slate-100 text-slate-800"
                )}
              >
                {msg.content ||
                  (streaming && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </span>
                  ) : (
                    ""
                  ))}
              </div>
              {msg.role === "user" && <Avatar name="Eu" size="sm" className="shrink-0" />}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
              >
                <Paperclip size={12} />
                {a.filename}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={sendMessage}
          className="flex items-center gap-2 border-t border-line p-3"
        >
          <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <Paperclip size={17} />
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.xlsx,.pptx"
            />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Conversar com o agente..."
            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()} className="h-9 w-9 p-0">
            <Send size={15} />
          </Button>
        </form>
      </div>
    </div>
  );
}
