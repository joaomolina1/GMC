import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@lib/supabase/server";
import { getCatalog, getUserFeedState, getViewer } from "@lib/tvibox/server";
import { seriesProgress } from "@lib/tvibox/feed";
import { SaveSeriesButton } from "../../../_components/SaveSeriesButton";

export const dynamic = "force-dynamic";

export default async function SeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/tvibox/entrar");

  const { series, episodes } = await getCatalog(supabase);
  const s = series.find((x) => x.slug === slug);
  if (!s) notFound();

  const eps = episodes.filter((e) => e.series_id === s.id).sort((a, b) => a.number - b.number);
  const user = await getUserFeedState(
    viewer.id,
    eps.map((e) => e.id),
    supabase
  );
  const prog = seriesProgress(s, episodes, user.progress);
  const firstFree = eps.find((e) => e.is_free && e.video_url) ?? eps[0];
  const resume =
    eps.find((e) => {
      const p = user.progress.get(e.id);
      return p && !p.completed && p.position > 1;
    }) ?? eps.find((e) => !user.progress.get(e.id)?.completed && (e.is_free || user.unlocked.has(e.id)) && e.video_url);
  const placeholders = Math.max(0, Math.min(3, s.total_episodes - eps.length));
  const pct = Math.round((prog.seen / prog.total) * 100);

  return (
    <section className="tb-view" aria-label={s.title}>
      <div
        className="tb-hero"
        style={{
          backgroundImage: s.poster_url
            ? `url(${s.poster_url})`
            : `linear-gradient(155deg, ${s.palette.from} 0%, ${s.palette.to} 100%)`,
        }}
      >
        <div className="vig" />
        <div className="top">
          <Link href="/tvibox/series" aria-label="Voltar às séries">
            ‹
          </Link>
          <SaveSeriesButton seriesId={s.id} initialSaved={user.saved.has(s.id)} />
        </div>
        <div className="info">
          <div className="kick">
            {s.badge === "hot" && <span className="tb-badge hot" style={{ position: "static" }}>🔥 Em alta</span>}
            {s.badge === "new" && <span className="tb-badge" style={{ position: "static" }}>Novo</span>}
            <span>
              {s.genre} · {s.total_episodes} episódios · {prog.label}
            </span>
          </div>
          <h1>{s.title}</h1>
          <p>{s.synopsis}</p>
          <div className="tb-progressbar" aria-label={`Progresso ${pct}%`}>
            <i style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
        </div>
      </div>

      <div className="tb-cta-row" style={{ marginTop: 4 }}>
        {resume ? (
          <Link href={`/tvibox?ep=${resume.id}`} className="tb-btn-primary">
            ▶ Continuar · EP {resume.number}
          </Link>
        ) : firstFree ? (
          <Link href={`/tvibox?ep=${firstFree.id}`} className="tb-btn-primary">
            ▶ Ver EP {firstFree.number} grátis
          </Link>
        ) : null}
      </div>

      <div className="tb-body">
        {s.cast_notes?.length > 0 && (
          <>
            <p className="tb-section-title">Elenco (atores gerados por IA)</p>
            <div className="tb-cast">
              {s.cast_notes.map((c) => (
                <div className="c" key={c.name}>
                  <b>{c.name}</b>
                  <span>{c.role}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="tb-section-title">Episódios</p>
        <div className="tb-eplist">
          {eps.map((e) => {
            const unlocked = e.is_free || user.unlocked.has(e.id);
            const p = user.progress.get(e.id);
            const status = p?.completed
              ? { cls: "done", label: "Visto ✓" }
              : e.is_free
                ? { cls: "free", label: "Grátis" }
                : unlocked
                  ? { cls: "done", label: e.video_url ? "Desbloqueado" : "Em breve ✓" }
                  : { cls: "", label: `🪙 ${e.coin_cost}` };
            return (
              <Link key={e.id} href={`/tvibox?ep=${e.id}`} className="tb-epi">
                <div
                  className="num"
                  style={{
                    backgroundImage: (e.poster_url || s.poster_url) ? `url(${e.poster_url || s.poster_url})` : undefined,
                    backgroundColor: s.palette.from,
                  }}
                >
                  <span>EP {e.number}</span>
                </div>
                <div className="mid">
                  <b>{e.title}</b>
                  <span>
                    {e.video_url
                      ? `${e.duration_seconds ?? "—"} s${e.render_kind === "animatic" ? " · animatic" : ""}`
                      : e.hook_text || e.synopsis}
                  </span>
                </div>
                <span className={`st ${status.cls}`}>{status.label}</span>
              </Link>
            );
          })}
          {Array.from({ length: placeholders }).map((_, i) => (
            <div key={`ph-${i}`} className="tb-epi disabled" aria-disabled>
              <div className="num" style={{ backgroundColor: s.palette.to }}>
                <span>EP {eps.length + i + 1}</span>
              </div>
              <div className="mid">
                <b>Em produção</b>
                <span>Novos episódios todos os dias</span>
              </div>
              <span className="st soon">Em breve</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
