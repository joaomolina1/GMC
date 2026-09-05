"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { unlockCost } from "@lib/tvibox/economy";
import type { FeedItem, SeriesRow } from "@lib/tvibox/types";
import { useSubtitles } from "./useSubtitles";
import { useWallet } from "./WalletProvider";

const CHROME_MS = 2800;
const SAVE_EVERY_SECONDS = 5;

/**
 * Player imersivo de uma série: um episódio por ecrã, scroll vertical para o
 * seguinte, sem texto sobre o vídeo. A única UI é um "chrome" que se esconde
 * (voltar · EP n/N · som), a barra de progresso e os cartões de paywall/fim.
 */
export function Player({ series, initialItems, startNumber }: { series: SeriesRow; initialItems: FeedItem[]; startNumber: number }) {
  const router = useRouter();
  const { api, unlock } = useWallet();
  const [subtitles, setSubtitles] = useSubtitles();
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const startIndex = Math.max(0, items.findIndex((i) => i.episode.number === startNumber));
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [saved, setSaved] = useState(initialItems[0]?.saved ?? false);
  const feedRef = useRef<HTMLDivElement>(null);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showChrome = useCallback(() => {
    setChrome(true);
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), CHROME_MS);
  }, []);

  useEffect(() => {
    showChrome();
    return () => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
    };
  }, [showChrome]);

  // Posiciona no episódio inicial antes do primeiro paint visível.
  useEffect(() => {
    const root = feedRef.current;
    if (!root || startIndex === 0) return;
    const el = root.querySelector<HTMLElement>(`[data-feed-index="${startIndex}"]`);
    if (el) root.scrollTop = el.offsetTop;
  }, [startIndex]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-index]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            setActive(Number((e.target as HTMLElement).dataset.feedIndex));
            showChrome();
          }
        }
      },
      { root, threshold: [0.6] }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [items.length, showChrome]);

  const scrollToIndex = useCallback((i: number) => {
    const el = feedRef.current?.querySelector<HTMLElement>(`[data-feed-index="${i}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        scrollToIndex(Math.min(items.length, active + 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        scrollToIndex(Math.max(0, active - 1));
      } else if (e.key === "Escape") {
        router.push("/tvibox");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, router, scrollToIndex]);

  const patch = useCallback((id: string, p: Partial<FeedItem>) => {
    setItems((prev) => prev.map((it) => (it.episode.id === id ? { ...it, ...p } : it)));
  }, []);

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

  const onSaveSeries = useCallback(async () => {
    const on = !saved;
    setSaved(on);
    try {
      await api("/api/tvibox/list", { seriesId: series.id, on });
    } catch {
      setSaved(!on);
    }
  }, [api, saved, series.id]);

  const current = items[Math.min(active, items.length - 1)];
  const atEnd = active >= items.length;

  return (
    <>
      <div className="tb-feed" ref={feedRef} id="tvibox-player">
        {items.map((item, i) => (
          <PlayerCard
            key={item.episode.id}
            item={item}
            index={i}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            muted={muted}
            subtitles={subtitles}
            onTap={showChrome}
            onAutoplayBlocked={() => setMuted(true)}
            onUnlock={() => onUnlock(item)}
            onProgress={(pos, done) => onProgress(item, pos, done)}
            onEnded={() => scrollToIndex(i + 1)}
          />
        ))}
        <article className="tb-ep" data-feed-index={items.length} aria-label="Fim dos episódios disponíveis">
          <div className="tb-endcard">
            <div className="kicker">Por agora é tudo</div>
            <h3>{series.title}</h3>
            <p>Novos episódios todos os dias. Guarda a série para seres avisado quando o próximo estrear.</p>
            <div className="actions">
              <button type="button" className="tb-btn-primary" style={{ maxWidth: "none" }} onClick={onSaveSeries}>
                {saved ? "🔖 Guardada em A Minha Lista" : "🔖 Guardar série"}
              </button>
              <button type="button" className="tb-btn-ghost" style={{ padding: 13 }} onClick={() => scrollToIndex(0)}>
                ↺ Voltar ao EP 1
              </button>
              <Link href="/tvibox" className="tb-btn-ghost" style={{ padding: 13 }}>
                Descobrir outras séries
              </Link>
            </div>
          </div>
        </article>
      </div>

      <div className={`tb-chrome ${chrome || atEnd ? "" : "hidden"}`} onPointerDown={showChrome}>
        <Link href="/tvibox" className="tb-chrome-btn" aria-label="Voltar">
          ‹
        </Link>
        <div className="mid">
          {atEnd ? (
            series.title
          ) : (
            <>
              EP {current?.episode.number} / {series.total_episodes}
              <small>{series.title}</small>
            </>
          )}
        </div>
        {!atEnd && current?.episode.subtitles_url && (
          <button
            type="button"
            className={`tb-chrome-btn tb-cc ${subtitles ? "on" : ""}`}
            aria-label={subtitles ? "Desligar legendas" : "Ligar legendas"}
            aria-pressed={subtitles}
            onClick={() => setSubtitles(!subtitles)}
          >
            CC
          </button>
        )}
        <button
          type="button"
          className="tb-chrome-btn"
          aria-label={muted ? "Ativar som" : "Silenciar"}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
    </>
  );
}

function PlayerCard({
  item,
  index,
  active,
  near,
  muted,
  subtitles,
  onTap,
  onAutoplayBlocked,
  onUnlock,
  onProgress,
  onEnded,
}: {
  item: FeedItem;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  subtitles: boolean;
  onTap: () => void;
  onAutoplayBlocked: () => void;
  onUnlock: () => void;
  onProgress: (position: number, completed: boolean) => void;
  onEnded: () => void;
}) {
  const { wallet, plusActive, watchAd } = useWallet();
  const { episode, series } = item;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const lastSaved = useRef(0);
  const completedSent = useRef(false);
  const mutedRef = useRef(muted);
  const resumeAtRef = useRef(item.resumeAt);
  const blockedRef = useRef(onAutoplayBlocked);
  mutedRef.current = muted;
  resumeAtRef.current = item.resumeAt;
  blockedRef.current = onAutoplayBlocked;

  const posterUrl = episode.poster_url || series.poster_url || undefined;
  const hasVideo = !item.locked && !!episode.video_url;
  const cost = unlockCost(episode, plusActive);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (active) {
      if (resumeAtRef.current > 1 && v.currentTime < 1) v.currentTime = resumeAtRef.current;
      v.muted = mutedRef.current;
      const p = v.play();
      if (p)
        p.then(() => setPaused(false)).catch(() => {
          // Política de autoplay: tenta sem som e avisa o player.
          v.muted = true;
          blockedRef.current();
          v.play().then(() => setPaused(false)).catch(() => setPaused(true));
        });
    } else {
      v.pause();
      setPaused(false);
    }
  }, [active, hasVideo]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted, hasVideo]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (const t of Array.from(v.textTracks)) t.mode = subtitles ? "showing" : "hidden";
  }, [subtitles, hasVideo, near]);

  const tap = useCallback(() => {
    onTap();
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (v.paused) {
      void v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
      onProgress(v.currentTime, false);
    }
  }, [hasVideo, onProgress, onTap]);

  const onTime = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    if (v.currentTime - lastSaved.current >= SAVE_EVERY_SECONDS) {
      lastSaved.current = v.currentTime;
      onProgress(v.currentTime, false);
    }
  }, [onProgress]);

  const onVideoEnded = useCallback(() => {
    if (!completedSent.current) {
      completedSent.current = true;
      onProgress(videoRef.current?.duration ?? 0, true);
    }
    onEnded();
  }, [onEnded, onProgress]);

  return (
    <article className="tb-ep" data-feed-index={index} aria-label={`EP ${episode.number} — ${episode.title}`}>
      <div className="tb-poster" style={{ backgroundImage: posterUrl ? `url(${posterUrl})` : undefined }}>
        {!hasVideo && (
          <div className="ptitle">
            <span>EP {episode.number}</span>
            <b>{episode.title}</b>
          </div>
        )}
        <div className="vig" style={{ opacity: hasVideo ? 0 : 1 }} />
      </div>

      {hasVideo && near && (
        <video
          ref={videoRef}
          src={episode.video_url as string}
          poster={posterUrl}
          playsInline
          preload={active ? "auto" : "metadata"}
          crossOrigin={episode.subtitles_url ? "anonymous" : undefined}
          onTimeUpdate={onTime}
          onEnded={onVideoEnded}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onPause={() => setPaused(true)}
          onPlay={() => setPaused(false)}
        >
          {episode.subtitles_url && (
            <track kind="subtitles" src={episode.subtitles_url} srcLang="pt" label="Português" />
          )}
        </video>
      )}

      <div className="tb-pbar" aria-hidden>
        <i style={{ width: `${hasVideo ? progress : 0}%` }} />
      </div>

      {!item.locked && <button className="tb-tap" aria-label={paused ? "Retomar" : "Pausar"} onClick={tap} />}

      {hasVideo && active && paused && (
        <div className="tb-paused" aria-hidden>
          ▶
        </div>
      )}
      {hasVideo && active && buffering && !paused && (
        <div className="tb-loading" aria-hidden>
          <i />
        </div>
      )}

      {!item.locked && !hasVideo && (
        <div className="tb-lock" style={{ backdropFilter: "none" }}>
          <div className="kicker">Desbloqueado</div>
          <h3>{episode.title}</h3>
          <div className="sub">{episode.synopsis || episode.hook_text}</div>
          <div className="bal">✓ Tens acesso · o episódio estreia em breve e vais ser avisado</div>
        </div>
      )}

      {item.locked && (
        <div className="tb-lock">
          <div className="kicker">Continua no próximo episódio</div>
          <h3>{episode.hook_title || episode.title}</h3>
          <div className="sub">{episode.hook_text || episode.synopsis}</div>
          <button
            type="button"
            className="tb-btn-primary"
            onClick={async () => {
              setUnlocking(true);
              await onUnlock();
              setUnlocking(false);
            }}
            disabled={unlocking}
          >
            {cost === 0 ? "✦ Ver com TVI Box+" : `🪙 Desbloquear por ${cost} moedas`}
          </button>
          <div className="alt">
            <button type="button" className="tb-btn-ghost" onClick={() => void watchAd()}>
              ▶ Ver anúncio (+15)
            </button>
            <Link href="/tvibox/carteira" className="tb-btn-ghost">
              TVI Box+
            </Link>
          </div>
          <div className="bal">
            Tens <b>{wallet.coins}</b> moedas · EP {episode.number} · {series.title}
          </div>
        </div>
      )}
    </article>
  );
}
