import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@lib/supabase/server";
import { seriesProgress } from "@lib/tvibox/feed";
import { getCatalog, getViewer } from "@lib/tvibox/server";

export const dynamic = "force-dynamic";

export default async function SeriesPage() {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/tvibox/entrar");

  const { series, episodes } = await getCatalog(supabase);
  const { data: progressRows } = await supabase
    .from("tvibox_progress")
    .select("episode_id, position_seconds, completed")
    .eq("user_id", viewer.id);
  const progress = new Map(
    (progressRows ?? []).map((p) => [p.episode_id, { position: Number(p.position_seconds), completed: !!p.completed }])
  );

  return (
    <section className="tb-view" aria-label="Séries">
      <div className="tb-vhead">
        <h1>Séries</h1>
        <p>Folhetins verticais · novos episódios todos os dias</p>
      </div>
      <div className="tb-grid">
        {series.map((s) => {
          const prog = seriesProgress(s, episodes, progress);
          return (
            <Link
              key={s.id}
              href={`/tvibox/series/${s.slug}`}
              className="tb-card"
              style={{
                backgroundImage: s.poster_url
                  ? `url(${s.poster_url})`
                  : `linear-gradient(155deg, ${s.palette.from} 0%, ${s.palette.to} 100%)`,
              }}
            >
              <div className="vig" />
              {s.badge === "hot" && <span className="tb-badge hot">🔥 Em alta</span>}
              {s.badge === "new" && <span className="tb-badge">Novo</span>}
              <span className="prog">{prog.label}</span>
              <div className="ct">
                <b>{s.title}</b>
                <span>
                  {s.genre}
                  {s.tagline ? ` · ${s.tagline}` : ""}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
