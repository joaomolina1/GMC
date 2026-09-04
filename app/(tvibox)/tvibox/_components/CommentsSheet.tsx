"use client";

import { useEffect, useState } from "react";
import type { FeedItem } from "@lib/tvibox/types";
import { useWallet } from "./WalletProvider";

interface Comment {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
  is_mine: boolean;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function CommentsSheet({
  item,
  onClose,
  onCountChange,
}: {
  item: FeedItem;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}) {
  const { api, toast } = useWallet();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ comments: Comment[] }>(`/api/tvibox/comments?episodeId=${item.episode.id}`, undefined, "GET")
      .then((r) => alive && setComments(r.comments))
      .catch(() => alive && setComments([]));
    return () => {
      alive = false;
    };
  }, [api, item.episode.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await api<{ comment: Comment }>("/api/tvibox/comments", { episodeId: item.episode.id, body: text });
      setComments((prev) => [r.comment, ...(prev ?? [])]);
      setBody("");
      onCountChange(1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível comentar");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/tvibox/comments?id=${id}`, undefined, "DELETE");
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
      onCountChange(-1);
    } catch {
      toast("Não foi possível apagar");
    }
  }

  return (
    <div className="tb-sheet-bg" onClick={onClose} role="presentation">
      <div className="tb-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comentários">
        <div className="hd">
          <b>
            Comentários · EP {item.episode.number} · {item.series.title}
          </b>
          <button type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="list">
          {comments === null && <div className="tb-empty">A carregar…</div>}
          {comments && comments.length === 0 && (
            <div className="tb-empty">Sê o primeiro a comentar este episódio.</div>
          )}
          {comments?.map((c) => (
            <div className="tb-comment" key={c.id}>
              <div className="av">{initials(c.author_name)}</div>
              <div className="bd">
                <b>{c.author_name}</b>
                <p>{c.body}</p>
                <span>{timeAgo(c.created_at)}</span>
              </div>
              {c.is_mine && (
                <button type="button" className="del" onClick={() => remove(c.id)} aria-label="Apagar comentário">
                  apagar
                </button>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={submit}>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreve um comentário…"
            maxLength={500}
            aria-label="Novo comentário"
          />
          <button type="submit" disabled={sending || !body.trim()}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
