"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHistory } from "@lib/pt26/history";
import type { LivePayload } from "@lib/pt26/types";
import { HistoryChart } from "./Chart";
import { Logo } from "./primitives";
import { VIEWS, type ViewProps } from "./views";

type Mode = "live" | "preview";
type View = "results" | "history";

interface NavState {
  week: number | null;
  q: number | null;
  quadro: number;
  view: View;
}

const HOME: NavState = { week: null, q: null, quadro: 0, view: "results" };
const CACHE_VERSION = "v1";

interface Cached {
  payload: LivePayload;
  savedAt: string;
}

function cacheKey(mode: Mode) {
  return `pt26:${mode}:${CACHE_VERSION}`;
}

function readCache(mode: Mode): Cached | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return parsed?.payload?.weeks ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(mode: Mode, payload: LivePayload) {
  try {
    window.localStorage.setItem(cacheKey(mode), JSON.stringify({ payload, savedAt: new Date().toISOString() } satisfies Cached));
  } catch {
    /* storage cheio ou indisponível — o ecrã continua a funcionar em memória */
  }
}

/** Pré-carrega fotografias e logótipos para não haver imagens a aparecer durante a emissão. */
function preloadImages(payload: LivePayload) {
  const urls = new Set<string>();
  for (const p of Object.values(payload.people)) {
    if (p.photo) {
      urls.add(p.photo.small);
      urls.add(p.photo.large);
    }
  }
  for (const party of Object.values(payload.parties)) if (party.logoUrl) urls.add(party.logoUrl);
  for (const u of urls) {
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }
}

function ResultView({ kind, ...props }: ViewProps & { kind: LivePayload["questions"][number]["kind"] }) {
  const View = VIEWS[kind];
  return <View {...props} />;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function LiveScreen({ mode, accessKey }: { mode: Mode; accessKey: string | null }) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "forbidden">("loading");
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [nav, setNav] = useState<NavState>(HOME);
  const rootRef = useRef<HTMLDivElement>(null);

  // Um único pedido ao abrir; sem novos pedidos durante a emissão.
  useEffect(() => {
    let cancelled = false;
    const url = mode === "preview" ? "/api/pt26/live/preview" : `/api/pt26/live${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 403 || res.status === 401) {
          const cached = readCache(mode);
          if (cancelled) return;
          if (cached) {
            setPayload(cached.payload);
            setOfflineSince(cached.savedAt);
            setStatus("ready");
          } else setStatus("forbidden");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LivePayload;
        if (cancelled) return;
        writeCache(mode, data);
        preloadImages(data);
        setPayload(data);
        setOfflineSince(null);
        setStatus(data.weeks.length ? "ready" : "empty");
      } catch {
        const cached = readCache(mode);
        if (cancelled) return;
        if (cached) {
          preloadImages(cached.payload);
          setPayload(cached.payload);
          setOfflineSince(cached.savedAt);
          setStatus(cached.payload.weeks.length ? "ready" : "empty");
        } else setStatus("empty");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, accessKey]);

  const weeks = payload?.weeks ?? [];
  const questions = payload?.questions ?? [];
  const week = nav.week !== null ? weeks[nav.week] ?? null : null;
  const question = nav.q !== null ? questions[nav.q] ?? null : null;
  const weekQuestion = week && question ? week.questions.find((x) => x.questionNumber === question.number) : null;
  const quadros = weekQuestion?.quadros ?? [];
  const quadro = quadros[Math.min(nav.quadro, Math.max(0, quadros.length - 1))] ?? null;

  const go = useCallback((patch: Partial<NavState>) => setNav((s) => ({ ...s, ...patch })), []);
  const goHome = useCallback(() => setNav(HOME), []);
  const selectWeek = useCallback((i: number) => setNav({ week: i, q: null, quadro: 0, view: "results" }), []);
  const selectQuestion = useCallback((i: number) => setNav((s) => ({ ...s, q: i, quadro: 0, view: "results" })), []);

  // Atalhos: ←/→ quadros, ↑/↓ perguntas, H histórico, Esc início, 1–8 pergunta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!payload) return;
      if (e.key === "Escape") {
        setNav((s) => ({ ...s, q: null, quadro: 0, view: "results" }));
        return;
      }
      if (nav.week === null) return;
      if (/^[1-8]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < questions.length) selectQuestion(i);
        return;
      }
      if (nav.q === null) return;
      const nq = quadros.length;
      if (e.key === "ArrowRight") go({ quadro: Math.min(nq - 1, nav.quadro + 1) });
      else if (e.key === "ArrowLeft") go({ quadro: Math.max(0, nav.quadro - 1) });
      else if (e.key === "ArrowDown") selectQuestion(Math.min(questions.length - 1, nav.q + 1));
      else if (e.key === "ArrowUp") selectQuestion(Math.max(0, nav.q - 1));
      else if (e.key.toLowerCase() === "h") go({ view: nav.view === "history" ? "results" : "history" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, nav, questions.length, quadros.length, go, selectQuestion]);

  const history = useMemo(
    () => (payload && question && quadro && nav.week !== null ? buildHistory(payload, question.number, quadro, nav.week) : null),
    [payload, question, quadro, nav.week]
  );

  const year = payload?.settings.logoYear ?? "26";
  const latestIdx = weeks.length - 1;

  return (
    <div ref={rootRef} className="screen" onContextMenu={(e) => e.preventDefault()} style={{ height: "100%" }}>
      <div className="bg" />
      {status === "forbidden" ? (
        <div className="locked">
          <Logo year={year} />
          <p>Ecrã reservado à emissão. Abre o endereço fornecido pela produção (com a chave de acesso).</p>
        </div>
      ) : status === "loading" ? (
        <div className="locked">
          <Logo year={year} />
          <p>Tracking poll</p>
        </div>
      ) : (
        <div className="app">
          <main>
            {nav.q === null || !question ? (
              <div className="home fade" key={`home-${nav.week ?? "x"}`}>
                <Logo year={year} onClick={goHome} />
                <div className="sub">
                  Tracking poll
                  {week ? ` — ${week.label}, ${week.dateLabel}` : ""}
                  {mode === "preview" ? " · pré-visualização" : ""}
                </div>
                <div className="hint">
                  {status === "empty" ? "Ainda não há semanas publicadas" : week ? "Escolha uma pergunta na coluna da direita" : "Escolha uma semana na coluna da direita"}
                  <i />
                </div>
              </div>
            ) : (
              <>
                <header className="vh">
                  <div>
                    <div className="week">
                      <span className="dot" />
                      {week?.label}, {week?.dateLabel}
                      <span className="q">
                        Pergunta {question.number} de {questions.length}
                      </span>
                    </div>
                    <h1>{question.title}</h1>
                    {(question.subtitle || (quadros.length > 1 && quadro?.title)) && (
                      <div className="qsub">{[question.subtitle, quadros.length > 1 ? quadro?.title : ""].filter(Boolean).join(" — ")}</div>
                    )}
                  </div>
                  <Logo year={year} onClick={goHome} />
                </header>

                <section className="content fade" key={`${week?.id}-${question.number}-${quadro?.idx ?? 0}-${nav.view}`}>
                  {!quadro || !week ? (
                    <div className="nodata">Sem resultados para esta pergunta nesta semana.</div>
                  ) : nav.view === "history" && history ? (
                    <HistoryChart history={history} currentLabel={week.label} />
                  ) : (
                    <ResultView kind={question.kind} payload={payload!} question={question} quadro={quadro} quadros={quadros} week={week} />
                  )}
                </section>

                <footer className="controls">
                  <div className="pills">
                    {quadros.length > 1 ? (
                      quadros.map((x, i) => (
                        <button key={x.idx} type="button" className={`pill ${i === (quadro ? quadros.indexOf(quadro) : 0) ? "on" : ""}`} onClick={() => go({ quadro: i })}>
                          <span className="k">{i + 1}</span>
                          {x.title || (question.kind === "MINISTER" && x.personId ? payload?.people[x.personId]?.name : "") || `Quadro ${i + 1}`}
                        </button>
                      ))
                    ) : (
                      <span className="mid">Um quadro</span>
                    )}
                  </div>
                  <div className="mid">
                    <button type="button" className="nav" disabled={nav.q === 0} onClick={() => selectQuestion(Math.max(0, (nav.q ?? 0) - 1))} aria-label="Pergunta anterior">
                      ‹
                    </button>
                    <button type="button" className="nav" disabled={nav.q === questions.length - 1} onClick={() => selectQuestion(Math.min(questions.length - 1, (nav.q ?? 0) + 1))} aria-label="Pergunta seguinte">
                      ›
                    </button>
                  </div>
                  <div className="seg">
                    <button type="button" className={`pill ${nav.view === "results" ? "on" : ""}`} onClick={() => go({ view: "results" })}>
                      Resultados
                    </button>
                    <button type="button" className={`pill ${nav.view === "history" ? "on" : ""}`} onClick={() => go({ view: "history" })}>
                      Histórico
                    </button>
                  </div>
                </footer>
              </>
            )}
            {payload?.settings.footerText && <div className="source">{payload.settings.footerText}</div>}
          </main>

          <aside>
            <div className="side-head">
              <Logo year={year} onClick={goHome} />
              <span className="prod">
                Tracking poll
                {offlineSince && <span className="off">dados guardados · {timeLabel(offlineSince)}</span>}
              </span>
            </div>
            {nav.week === null ? (
              <>
                <div className="side-title">
                  <h2>Escolha a semana</h2>
                </div>
                <div className="list">
                  {weeks.length === 0 && <div className="empty">Sem semanas publicadas.<br />A produção publica a semana no back-office.</div>}
                  {[...weeks].reverse().map((w, ri) => {
                    const i = weeks.length - 1 - ri;
                    return (
                      <button key={w.id} type="button" className="item" onClick={() => selectWeek(i)}>
                        <span className="num">{i + 1}</span>
                        <span>
                          <div className="t">{w.label}</div>
                          <div className="s">{w.dateLabel}</div>
                        </span>
                        {w.status === "DRAFT" ? <span className="tag draft">Rascunho</span> : i === latestIdx ? <span className="tag">Atual</span> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="side-title">
                  <h2>
                    {week?.label} <span>{week?.dateLabel}</span>
                  </h2>
                  <button type="button" className="back" onClick={goHome}>
                    ‹ Semanas
                  </button>
                </div>
                <div className="list">
                  {questions.map((q, i) => {
                    const nq = week?.questions.find((x) => x.questionNumber === q.number)?.quadros.length ?? 0;
                    return (
                      <button key={q.id} type="button" className={`item ${nav.q === i ? "on" : ""}`} onClick={() => selectQuestion(i)}>
                        <span className="num">{q.number}</span>
                        <span>
                          <div className="t">{q.title}</div>
                          {nq > 1 && <div className="s">{nq} quadros</div>}
                          {nq === 0 && <div className="s">sem dados</div>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
