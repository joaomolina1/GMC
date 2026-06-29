"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Paperclip } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Card } from "@/_design_system/Card";

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
  const [attachments, setAttachments] = useState<Array<{ storage_path: string; filename: string; mime: string; kind: string }>>([]);
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
              assistantContent += `\n\n🔧 *A usar skill: ${data.name}*\n`;
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

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/agents/${agentId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <h2 className="text-xl font-bold text-gray-900">Chat — {agentName}</h2>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden" padding="sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-center text-gray-400">Inicie uma conversa com o agente</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#0066B3] text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {msg.content || (streaming && i === messages.length - 1 ? "..." : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {attachments.length > 0 && (
          <div className="flex gap-2 border-t border-gray-100 px-4 py-2">
            {attachments.map((a, i) => (
              <span key={i} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                📎 {a.filename}
              </span>
            ))}
          </div>
        )}

        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-gray-200 p-4">
          <label className="cursor-pointer rounded-lg p-2 text-gray-500 hover:bg-gray-100">
            <Paperclip size={18} />
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva a sua mensagem..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#0066B3] focus:outline-none"
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()}>
            <Send size={16} />
          </Button>
        </form>
      </Card>
    </div>
  );
}
