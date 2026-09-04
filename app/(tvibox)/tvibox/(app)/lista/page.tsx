import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@lib/supabase/server";
import { seriesProgress } from "@lib/tvibox/feed";
import { getCatalog, getViewer } from "@lib/tvibox/server";

export const dynamic = "force-dynamic";

export default async function ListaPage() {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/tvibox/entrar");

  const [{ series, episodes }, { data: list }, { data: progressRows }] = await Promise.all([
    getCatalog(supabase),
    supabase.from("tvibox_list").select("series_id, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }),
    supabase.from("tvibox_progress").select("episode_id, position_seconds, completed").eq("user_id", viewer.id),
  ]);
  const saved = (list ?? []).map((l) => series.find((s) => s.id === l.series_id)).filter((s): s is NonNullable<typeof s> => !!s);
  const progress = new Map(
    (progressRows ?? []).map((p) => [p.episode_id, { position: Number(p.position_seconds), completed: !!p.completed }])
  );

  return (
    <section className="tb-view" aria-label="A Minha Lista">
      <div className="tb-vhead">
        <Link href="/tvibox/perfil" className="backlink">
          ‹ Perfil
        </Link>
        <h1>A Minha Lista</h1>
        <p>{saved.length ? `${saved.length} séries guardadas` : "Guarda séries a partir do feed ou da página da série"}</p>
      </div>
      {saved.length === 0 ? (
        <div className="tb-body">
          <div className="tb-empty">
            Ainda não guardaste nada.
            <br />
            <Link href="/tvibox/series" className="tb-link" style={{ display: "inline-block", marginTop: 10 }}>
              Explorar séries →
            </Link>
          </div>
        </div>
      ) : (
        <div className="tb-grid">
          {saved.map((s) => {
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
                <span className="prog">{prog.label}</span>
                <div className="ct">
                  <b>{s.title}</b>
                  <span>{s.genre}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
