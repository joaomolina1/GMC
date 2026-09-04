"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount } from "@lib/tvibox/economy";
import type { Banner } from "@lib/tvibox/feed";
import type { FeedItem } from "@lib/tvibox/types";
import { CommentsSheet } from "./CommentsSheet";
import { useWallet } from "./WalletProvider";

/** O banner abre sempre o primeiro episódio da série; o player trata de avançar por scroll. */
function playerHref(b: Banner): string {
  return `/tvibox/ver/${b.series.slug}?ep=${b.first.number}`;
}

function shorten(text: string | null, max = 150): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function Banners({ initialBanners }: { initialBanners: Banner[] }) {
  const router = useRouter();
  const { api, toast } = useWallet();
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [active, setActive] = useState(0);
  const [commentsFor, setCommentsFor] = useState<Banner | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-index]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.feedIndex));
        }
      },
      { root, threshold: [0.6] }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [banners.length]);

  // Pré-carrega a rota do player do banner ativo para a abertura ser imediata.
  useEffect(() => {
    const b = banners[active];
    if (b) router.prefetch(playerHref(b));
  }, [active, banners, router]);

  const patch = useCallback((seriesId: string, p: Partial<Banner>) => {
    setBanners((prev) => prev.map((b) => (b.series.id === seriesId ? { ...b, ...p } : b)));
  }, []);

  const onLike = useCallback(
    async (b: Banner) => {
      const on = !b.liked;
      patch(b.series.id, { liked: on, likeCount: b.likeCount + (on ? 1 : -1) });
      try {
        await api("/api/tvibox/like", { episodeId: b.cover.id, on });
      } catch {
        patch(b.series.id, { liked: !on, likeCount: b.likeCount });
        toast("Não foi possível registar o gosto");
      }
    },
    [api, patch, toast]
  );

  const onSave = useCallback(
    async (b: Banner) => {
      const on = !b.saved;
      patch(b.series.id, { saved: on });
      try {
        await api("/api/tvibox/list", { seriesId: b.series.id, on });
        toast(on ? "Guardado em A Minha Lista" : "Removido de A Minha Lista");
      } catch {
        patch(b.series.id, { saved: !on });
        toast("Não foi possível guardar");
      }
    },
    [api, patch, toast]
  );

  const onShare = useCallback(
    async (b: Banner) => {
      const url = `${window.location.origin}/tvibox/ver/${b.series.slug}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "TVI BOX", text: `${b.series.title} — ${b.series.genre}`, url });
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

  const open = useCallback((b: Banner) => router.push(playerHref(b)), [router]);

  if (!banners.length) {
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
        {banners.map((b, i) => (
          <BannerCard
            key={b.series.id}
            banner={b}
            index={i}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            onOpen={() => open(b)}
            onLike={() => onLike(b)}
            onSave={() => onSave(b)}
            onShare={() => onShare(b)}
            onComments={() => setCommentsFor(b)}
          />
        ))}
      </div>
      {commentsFor && (
        <CommentsSheet
          item={bannerAsItem(commentsFor)}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) => patch(commentsFor.series.id, { commentCount: Math.max(0, commentsFor.commentCount + delta) })}
        />
      )}
    </>
  );
}

function bannerAsItem(b: Banner): FeedItem {
  return {
    episode: b.cover,
    series: b.series,
    locked: false,
    pending: false,
    liked: b.liked,
    saved: b.saved,
    likeCount: b.likeCount,
    commentCount: b.commentCount,
    resumeAt: 0,
  };
}

function BannerCard({
  banner: b,
  index,
  active,
  near,
  onOpen,
  onLike,
  onSave,
  onShare,
  onComments,
}: {
  banner: Banner;
  index: number;
  active: boolean;
  near: boolean;
  onOpen: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onComments: () => void;
}) {
  const { plusActive } = useWallet();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { series, cover, first } = b;
  const posterUrl = cover.poster_url || series.poster_url || undefined;

  // Pré-visualização muda, só no banner visível.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [active]);

  const cta = `Ver EP ${first.number}`;
  const duration = first.duration_seconds ? `${Math.round(first.duration_seconds)} s` : null;

  return (
    <article className="tb-ep" data-feed-index={index} aria-label={series.title}>
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
        <div className="vig" />
      </div>

      {near && cover.video_url && (
        <video
          ref={videoRef}
          src={cover.video_url}
          poster={posterUrl}
          muted
          playsInline
          loop
          preload={active ? "auto" : "metadata"}
          aria-hidden
        />
      )}

      <span className="tb-banner-hint" aria-hidden>
        Pré-visualização · toca para ver
      </span>

      <button className="tb-tap" aria-label={`Abrir ${series.title}`} onClick={onOpen} />

      <div className="tb-cap">
        <div className="series">
          {cover.is_free ? <span className="tb-tag free">EP 1 grátis</span> : plusActive ? <span className="tb-tag plus">Box+</span> : <span className="tb-tag">TVI</span>}
          <span>
            {series.genre} · {b.available} {b.available === 1 ? "episódio" : "episódios"} · {b.progressLabel}
          </span>
        </div>
        <h2>{series.title}</h2>
        <p>{shorten(series.synopsis)}</p>
        <button type="button" className="tb-banner-cta" onClick={onOpen}>
          ▶ {cta}
          {duration && <small>{duration}</small>}
        </button>
      </div>

      <div className="tb-rail">
        <Link href={`/tvibox/series/${series.slug}`} aria-label={`Ficha da série ${series.title}`}>
          <span
            className="avatar"
            style={{
              display: "block",
              backgroundImage: series.poster_url ? `url(${series.poster_url})` : undefined,
              backgroundColor: series.palette?.from ?? "#3a1a24",
            }}
          />
        </Link>
        <button type="button" className={b.liked ? "on" : ""} onClick={onLike} aria-pressed={b.liked}>
          <span className="ic">♥</span>
          <span className="lbl">{formatCount(b.likeCount)}</span>
        </button>
        <button type="button" onClick={onComments}>
          <span className="ic">💬</span>
          <span className="lbl">{formatCount(b.commentCount)}</span>
        </button>
        <button type="button" className={`save ${b.saved ? "on" : ""}`} onClick={onSave} aria-pressed={b.saved}>
          <span className="ic">🔖</span>
          <span className="lbl">{b.saved ? "Guardado" : "Guardar"}</span>
        </button>
        <button type="button" onClick={onShare}>
          <span className="ic">↗</span>
          <span className="lbl">Enviar</span>
        </button>
      </div>
    </article>
  );
}
