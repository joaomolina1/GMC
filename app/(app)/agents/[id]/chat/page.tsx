"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Paperclip, Bot, X, Sparkles } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Avatar } from "@/_design_system/Avatar";
import { cn } from "@lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AgentChatPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [attachments, setAttachments] = useState<
    Array<{ storage_path: string; filename: string; mime: string; kind: string }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((d) => setAgentName(d.name));
  }, [agentId]);

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

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            if (data.type === "text") {
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
            if (data.type === "tool") {
              assistantContent += `\n\n\u{1F527} *A usar skill: ${data.name}*\n`;
            }
          } catch {
            // skip malformed
          }
        }
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

  const suggestions = [
    "Resume este documento",
    "Pesquisa as últimas notícias",
    "O que vês nesta imagem?",
  ];

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/agents/${agentId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Bot size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight text-slate-900">
              {agentName || "Agente"}
            </h2>
            <p className="text-xs text-slate-400">Assistente de IA</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-sm">
                <Sparkles size={30} />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                Comece a conversar
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Faça uma pergunta ou anexe um ficheiro para testar as skills do agente.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
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
              className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Bot size={16} />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
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
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-2.5">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
              >
                <Paperclip size={12} />
                {a.filename}
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-line p-3 sm:p-4">
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100">
            <Paperclip size={18} />
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva a sua mensagem..."
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()} className="aspect-square px-0">
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
