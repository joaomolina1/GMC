import { formatLisbonDateTime, formatPeople } from "@lib/chartbeat/format";
import type { ChannelMix } from "@lib/chartbeat/types";

const GROUPS: {
  title: string;
  parts: { key: keyof ChannelMix; label: string; color: string }[];
}[] = [
  {
    title: "De onde vieram",
    parts: [
      { key: "search", label: "Pesquisa", color: "#0284c7" },
      { key: "social", label: "Social", color: "#7c3aed" },
      { key: "internal", label: "Interno", color: "#ca234d" },
      { key: "direct", label: "Direto", color: "#16a34a" },
      { key: "links", label: "Links", color: "#d97706" },
    ],
  },
  {
    title: "Ecrã",
    parts: [
      { key: "mobile", label: "Mobile", color: "#0f766e" },
      { key: "desktop", label: "Desktop", color: "#1d4ed8" },
      { key: "tablet", label: "Tablet", color: "#9333ea" },
    ],
  },
  {
    title: "Fidelidade",
    parts: [
      { key: "new", label: "Novos", color: "#ea580c" },
      { key: "returning", label: "A voltar", color: "#ca8a04" },
      { key: "loyal", label: "Fiéis", color: "#15803d" },
    ],
  },
];

function Stack({ title, mix }: { title: string; mix: ChannelMix }) {
  const group = GROUPS.find((g) => g.title === title)!;
  const parts = group.parts.map((p) => ({ ...p, value: Number(mix[p.key] ?? 0) }));
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {total > 0 &&
          parts.map((p) => (
            <div
              key={p.label}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              title={`${p.label}: ${p.value}`}
            />
          ))}
      </div>
      <ul className="mt-2 space-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tabular-nums font-medium text-slate-800">{formatPeople(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChannelComposition({
  name,
  color,
  mix,
  at,
}: {
  name: string;
  color: string;
  mix: ChannelMix | null;
  at?: string;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            Composição · {name}
          </h3>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Origem, ecrã e fidelidade somados nos paths deste canal. É o mesmo `people` do gráfico, partido — não é a audiência do site inteiro.
          </p>
        </div>
        {at && <p className="text-xs text-slate-400">{formatLisbonDateTime(at)} · Lisboa</p>}
      </div>

      {!mix ? (
        <p className="mt-4 text-sm text-slate-500">
          Este minuto ainda não tem composição. Os próximos pontos do cron passam a gravá-la.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {GROUPS.map((g) => (
            <Stack key={g.title} title={g.title} mix={mix} />
          ))}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Player e engagement</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {mix.engagedSec == null ? "—" : `${formatPeople(mix.engagedSec)} s`}
            </p>
            <p className="text-[11px] text-slate-400">engagement médio neste minuto</p>
            {mix.playing == null ? (
              <p className="mt-3 text-xs text-slate-500">Este canal não tem um player Chartbeat associado.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                <li className="flex justify-between gap-3">
                  <span>A reproduzir</span>
                  <span className="tabular-nums font-medium text-slate-800">{formatPeople(mix.playing)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Em pausa</span>
                  <span className="tabular-nums font-medium text-slate-800">{formatPeople(mix.paused ?? 0)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Por começar</span>
                  <span className="tabular-nums font-medium text-slate-800">{formatPeople(mix.unplayed ?? 0)}</span>
                </li>
              </ul>
            )}
            <p className="mt-2 text-[11px] leading-snug text-slate-400">
              Quem está a reproduzir o vídeo não é o total de pessoas na página.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
