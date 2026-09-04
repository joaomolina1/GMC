"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@lib/tvibox/types";
import { EpisodeCard } from "./EpisodeCard";
import { CommentsSheet } from "./CommentsSheet";
import { useWallet } from "./WalletProvider";

export function Feed({ initialItems, focusId }: { initialItems: FeedItem[]; focusId: string | null }) {
  const { api, toast, unlock, wallet } = useWallet();
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [subtitles, setSubtitles] = useState(wallet.settings.subtitles);
  const [commentsFor, setCommentsFor] = useState<FeedItem | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSubtitles(wallet.settings.subtitles), [wallet.settings.subtitles]);

  // Episódio ativo = o que ocupa a maior parte do ecrã.
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-index]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            setActive(Number((e.target as HTMLElement).dataset.feedIndex));
          }
        }
      },
      { root, threshold: [0.6] }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (!focusId) return;
    feedRef.current?.scrollTo({ top: 0 });
  }, [focusId]);

  const scrollToIndex = useCallback((i: number) => {
    const root = feedRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-feed-index="${i}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        scrollToIndex(Math.min(items.length - 1, active + 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        scrollToIndex(Math.max(0, active - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, scrollToIndex]);

  const patch = useCallback((id: string, p: Partial<FeedItem>) => {
    setItems((prev) => prev.map((it) => (it.episode.id === id ? { ...it, ...p } : it)));
  }, []);

  const onLike = useCallback(
    async (item: FeedItem) => {
      const on = !item.liked;
      patch(item.episode.id, { liked: on, likeCount: item.likeCount + (on ? 1 : -1) });
      try {
        await api("/api/tvibox/like", { episodeId: item.episode.id, on });
      } catch {
        patch(item.episode.id, { liked: !on, likeCount: item.likeCount });
        toast("Não foi possível registar o gosto");
      }
    },
    [api, patch, toast]
  );

  const onSave = useCallback(
    async (item: FeedItem) => {
      const on = !item.saved;
      setItems((prev) => prev.map((it) => (it.series.id === item.series.id ? { ...it, saved: on } : it)));
      try {
        await api("/api/tvibox/list", { seriesId: item.series.id, on });
        toast(on ? "Guardado em A Minha Lista" : "Removido de A Minha Lista");
      } catch {
        setItems((prev) => prev.map((it) => (it.series.id === item.series.id ? { ...it, saved: !on } : it)));
        toast("Não foi possível guardar");
      }
    },
    [api, toast]
  );

  const onShare = useCallback(
    async (item: FeedItem) => {
      const url = `${window.location.origin}/tvibox?ep=${item.episode.id}`;
      const text = `${item.series.title} · EP ${item.episode.number} — ${item.episode.title}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "TVI BOX", text, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        toast("Ligação copiada");
      } catch {
        /* partilha cancelada */
      }
    },
    [toast]
  );

  const onUnlock = useCallback(
    async (item: FeedItem) => {
      const r = await unlock(item.episode.id);
      if (r.ok) patch(item.episode.id, { locked: false, pending: !item.episode.video_url });
    },
    [patch, unlock]
  );

  const onProgress = useCallback(
    (item: FeedItem, position: number, completed: boolean) => {
      void api("/api/tvibox/progress", { episodeId: item.episode.id, position, completed }).catch(() => {});
    },
    [api]
  );

  const onEnded = useCallback(
    (index: number) => {
      if (index < items.length - 1) scrollToIndex(index + 1);
    },
    [items.length, scrollToIndex]
  );

  if (!items.length) {
    return (
      <div className="tb-view">
        <div className="tb-vhead">
          <h1>Para Ti</h1>
          <p>Ainda não há episódios publicados.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tb-feed" ref={feedRef} id="tvibox-feed">
        {items.map((item, i) => (
          <EpisodeCard
            key={item.episode.id}
            item={item}
            index={i}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            muted={muted}
            subtitles={subtitles}
            onToggleMute={() => setMuted((m) => !m)}
            onLike={() => onLike(item)}
            onSave={() => onSave(item)}
            onShare={() => onShare(item)}
            onComments={() => setCommentsFor(item)}
            onUnlock={() => onUnlock(item)}
            onProgress={(pos, done) => onProgress(item, pos, done)}
            onEnded={() => onEnded(i)}
          />
        ))}
      </div>
      {commentsFor && (
        <CommentsSheet
          item={commentsFor}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) =>
            patch(commentsFor.episode.id, { commentCount: Math.max(0, commentsFor.commentCount + delta) })
          }
        />
      )}
    </>
  );
}
