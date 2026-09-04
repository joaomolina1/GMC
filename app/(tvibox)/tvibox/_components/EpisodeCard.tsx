"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, unlockCost } from "@lib/tvibox/economy";
import type { FeedItem } from "@lib/tvibox/types";
import { useWallet } from "./WalletProvider";

interface Props {
  item: FeedItem;
  index: number;
  active: boolean;
  /** Pré-carrega vídeo dos vizinhos imediatos. */
  near: boolean;
  muted: boolean;
  subtitles: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onComments: () => void;
  onUnlock: () => void;
  onProgress: (position: number, completed: boolean) => void;
  onEnded: () => void;
}

const SAVE_EVERY_SECONDS = 5;

export function EpisodeCard({
  item,
  index,
  active,
  near,
  muted,
  subtitles,
  onToggleMute,
  onLike,
  onSave,
  onShare,
  onComments,
  onUnlock,
  onProgress,
  onEnded,
}: Props) {
  const { wallet, plusActive, watchAd } = useWallet();
  const { episode, series } = item;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const lastSaved = useRef(0);
  const completedSent = useRef(false);

  const posterUrl = episode.poster_url || series.poster_url || undefined;
  const hasVideo = !item.locked && !!episode.video_url;
  const cost = unlockCost(episode, plusActive);

  // Reproduz apenas o episódio ativo; pausa os restantes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (active) {
      if (item.resumeAt > 1 && v.currentTime < 1) v.currentTime = item.resumeAt;
      const p = v.play();
      if (p) p.then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(false);
    }
  }, [active, hasVideo, item.resumeAt]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted, hasVideo]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (const t of Array.from(v.textTracks)) t.mode = subtitles ? "showing" : "hidden";
  }, [subtitles, hasVideo]);

  const onTap = useCallback(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (muted) {
      onToggleMute();
      if (v.paused) void v.play();
      return;
    }
    if (v.paused) {
      void v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
      onProgress(v.currentTime, false);
    }
  }, [hasVideo, muted, onProgress, onToggleMute]);

  const onTime = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    setProgress(pct);
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

  const handleUnlock = async () => {
    setUnlocking(true);
    await onUnlock();
    setUnlocking(false);
  };

  const durationLabel = episode.duration_seconds ? `${Math.round(episode.duration_seconds)} s` : "—";

  return (
    <article className="tb-ep" data-feed-index={index} aria-label={`${series.title} — EP ${episode.number}`}>
      <div className="tb-poster" style={{ backgroundImage: posterUrl ? `url(${posterUrl})` : undefined }}>
        {!posterUrl && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(155deg, ${series.palette?.from ?? "#3a1a24"} 0%, ${series.palette?.to ?? "#100a0c"} 100%)`,
            }}
          />
        )}
        {!hasVideo && (
          <div className="ptitle">
            <span>{series.genre}</span>
            <b>{series.title}</b>
          </div>
        )}
        <div className="vig" />
      </div>

      {hasVideo && (
        <video
          ref={videoRef}
          src={episode.video_url as string}
          poster={posterUrl}
          playsInline
          preload={near ? "auto" : "metadata"}
          muted={muted}
          crossOrigin="anonymous"
          onTimeUpdate={onTime}
          onEnded={onVideoEnded}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onPause={() => setPaused(true)}
          onPlay={() => setPaused(false)}
        >
          {episode.subtitles_url && (
            <track kind="subtitles" src={episode.subtitles_url} srcLang="pt" label="Português" default={subtitles} />
          )}
        </video>
      )}

      <div className="tb-pbar" aria-hidden>
        <i style={{ width: `${hasVideo ? progress : 0}%` }} />
      </div>

      <button className="tb-tap" aria-label={paused ? "Retomar" : "Pausar"} onClick={onTap} />

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
      {hasVideo && active && muted && (
        <div className="tb-mute-hint">
          <button type="button" onClick={onToggleMute}>
            🔇 Toca para ativar o som
          </button>
        </div>
      )}

      {!item.locked && (
        <>
          <div className="tb-cap">
            <div className="series">
              {episode.is_free ? <span className="tb-tag free">Grátis</span> : plusActive ? <span className="tb-tag plus">Box+</span> : <span className="tb-tag">TVI</span>}
              <span>
                EP {episode.number} · {series.title}
              </span>
            </div>
            <h2>{episode.title}</h2>
            <p>{episode.synopsis}</p>
            <div className="meta">
              {hasVideo ? (
                <>
                  <span>▶ {durationLabel}</span>
                  <span>·</span>
                  <span>drama vertical</span>
                  {episode.render_kind === "animatic" && (
                    <>
                      <span>·</span>
                      <span className="tb-tag animatic">Animatic</span>
                    </>
                  )}
                </>
              ) : (
                <span>✓ Desbloqueado · estreia em breve — ficas com acesso</span>
              )}
            </div>
          </div>

          <div className="tb-rail">
            <Link href={`/tvibox/series/${series.slug}`} aria-label={`Ver série ${series.title}`}>
              <span
                className="avatar"
                style={{
                  display: "block",
                  backgroundImage: series.poster_url ? `url(${series.poster_url})` : undefined,
                  backgroundColor: series.palette?.from ?? "#3a1a24",
                }}
              />
            </Link>
            <button type="button" className={item.liked ? "on" : ""} onClick={onLike} aria-pressed={item.liked}>
              <span className="ic">♥</span>
              <span className="lbl">{formatCount(item.likeCount)}</span>
            </button>
            <button type="button" onClick={onComments}>
              <span className="ic">💬</span>
              <span className="lbl">{formatCount(item.commentCount)}</span>
            </button>
            <button type="button" className={`save ${item.saved ? "on" : ""}`} onClick={onSave} aria-pressed={item.saved}>
              <span className="ic">🔖</span>
              <span className="lbl">{item.saved ? "Guardado" : "Guardar"}</span>
            </button>
            <button type="button" onClick={onShare}>
              <span className="ic">↗</span>
              <span className="lbl">Enviar</span>
            </button>
          </div>
        </>
      )}

      {item.locked && (
        <div className="tb-lock">
          <div className="kicker">Continua no próximo episódio</div>
          <h3>{episode.hook_title || episode.title}</h3>
          <div className="sub">{episode.hook_text || episode.synopsis}</div>
          <button type="button" className="tb-btn-primary" onClick={handleUnlock} disabled={unlocking}>
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
            Tens <b>{wallet.coins}</b> moedas · EP {episode.number} · {series.title} · 1.º episódio de cada série é
            grátis
          </div>
        </div>
      )}
    </article>
  );
}
