"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Eraser, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Avatar } from "@/_design_system/Avatar";
import { ChatMessageContent } from "@/_components/ChatMessageContent";
import {
  GeneratedFilesList,
  type GeneratedFileView,
} from "@/_components/GeneratedFilesList";
import { cn } from "@lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  files?: GeneratedFileView[];
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

  function clearConversation() {
    if (streaming) return;
    if (messages.length > 0 && !window.confirm("Limpar esta conversa de teste?")) return;
    setMessages([]);
    setConversationId(undefined);
    setInput("");
    setAttachments([]);
  }

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
    let assistantFiles: GeneratedFileView[] = [];
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
            label?: string;
            conversationId?: string;
            files?: GeneratedFileView[];
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
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
                files: assistantFiles,
              };
              return updated;
            });
          }
          if (data.type === "done" && data.conversationId) {
            setConversationId(data.conversationId);
          }
          if (data.type === "server_tool") {
            const label =
              data.label ??
              (data.name === "code_execution"
                ? "A gerar documento…"
                : data.name === "web_search"
                  ? "A pesquisar na web…"
                  : data.name);
            assistantContent += `\n\n⚙️ *${label}*\n`;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
                files: assistantFiles,
              };
              return updated;
            });
          }
          if (data.type === "files" && Array.isArray(data.files)) {
            assistantFiles = data.files;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
                files: assistantFiles,
              };
              return updated;
            });
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
    ? ["Olá!", "Cria um PPTX de 3 slides", "Pesquisa na web"]
    : [
        "Cria uma apresentação PowerPoint sobre o tema X",
        "Gera um Excel com os dados",
        "Pesquisa as últimas notícias",
      ];

  const isError =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].content.startsWith("Erro:");

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Bot size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">{agentName}</h3>
            <p className="text-[11px] text-slate-400">
              {messages.length === 0
                ? "Playground de teste"
                : `${messages.length} mensagem${messages.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearConversation}
          disabled={streaming || messages.length === 0}
          className="shrink-0"
          title="Limpar conversa"
        >
          <Eraser size={14} />
          {!compact && "Limpar"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-white to-slate-50/80 shadow-sm">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-md">
                <Sparkles size={26} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                Teste o agente aqui
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Edite o system prompt à esquerda e converse para validar o comportamento. Guarde
                antes de testar alterações importantes.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isStreamingEmpty =
              streaming && i === messages.length - 1 && msg.role === "assistant" && !msg.content;
            const isLastError = isError && i === messages.length - 1;

            return (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {msg.role === "assistant" ? (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
                    <Bot size={15} />
                  </span>
                ) : (
                  <Avatar name="Eu" size="sm" className="mt-0.5 shrink-0" />
                )}

                <div
                  className={cn(
                    "min-w-0 max-w-[min(85%,42rem)]",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 shadow-sm",
                      msg.role === "user"
                        ? "rounded-tr-md bg-brand-500 text-white"
                        : isLastError
                          ? "rounded-tl-md border border-rose-200 bg-rose-50 text-rose-800"
                          : "rounded-tl-md border border-slate-200/80 bg-white text-slate-800"
                    )}
                  >
                    {isStreamingEmpty ? (
                      <span className="inline-flex items-center gap-1.5 py-1 text-slate-400">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400" />
                        <span className="ml-1 text-xs">A pensar…</span>
                      </span>
                    ) : (
                      <>
                        <ChatMessageContent content={msg.content} role={msg.role} />
                        {msg.role === "assistant" && msg.files && msg.files.length > 0 && (
                          <GeneratedFilesList files={msg.files} />
                        )}
                      </>
                    )}
                  </div>
                  {msg.content && !isStreamingEmpty && (
                    <p className="mt-1 px-1 text-[10px] text-slate-400">
                      {msg.role === "user" ? "Tu" : agentName}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line bg-white/80 px-4 py-2">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm"
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
          className="flex items-end gap-2 border-t border-line bg-white p-3 sm:p-4"
        >
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100">
            <Paperclip size={18} />
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.xlsx,.pptx"
            />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Escreve uma mensagem… (Enter para enviar, Shift+Enter para nova linha)"
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            disabled={streaming}
          />
          <Button
            type="submit"
            disabled={streaming || !input.trim()}
            className="h-10 w-10 shrink-0 p-0"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
