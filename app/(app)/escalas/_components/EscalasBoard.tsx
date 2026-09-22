"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CircleAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/_design_system/Button";
import { Textarea } from "@/_design_system/Input";
import { avaliarAtribuicao } from "@lib/escalas/constraints";
import { addDays, eachDate, formatDayMonth, formatLongDate, formatRange, formatWeekdayShort } from "@lib/escalas/dates";
import { atribuicoesAConfirmar } from "@lib/escalas/suggest";
import type { ConformidadeResumo, EscalaSettings, QuadroEscala } from "@lib/escalas/types";
import type { ResultadoSugestao } from "@lib/escalas/suggest";
import { cn } from "@lib/utils";

const COR_TURNO: Record<string, string> = {
  S1: "bg-sky-100 text-sky-950",
  S2: "bg-cyan-100 text-cyan-950",
  S3: "bg-amber-100 text-amber-950",
  S4: "bg-orange-100 text-orange-950",
  S5: "bg-violet-100 text-violet-950",
  S6: "bg-slate-800 text-white",
};

type Selecao = { userId: string; date: string; modo: "turno" | "conformidade" };

export function EscalasBoard() {
  const [quadro, setQuadro] = useState<QuadroEscala | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [turno, setTurno] = useState<string | null>(null);
  const [justificacao, setJustificacao] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [sugestao, setSugestao] = useState<ResultadoSugestao | null>(null);
  const [excluirAvisos, setExcluirAvisos] = useState(false);
  const [justificacaoLote, setJustificacaoLote] = useState("");

  const carregar = useCallback(async (from?: string) => {
    setErro(null);
    const res = await fetch(from ? `/api/escalas?from=${from}` : "/api/escalas");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar a escala.");
    setQuadro(data);
    return data as QuadroEscala;
  }, []);

  useEffect(() => {
    carregar()
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [carregar]);

  async function recarregar() {
    if (!quadro) return;
    setAGravar(true);
    try {
      await carregar(quadro.from);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setAGravar(false);
    }
  }

  function abrirCelula(userId: string, date: string) {
    const existente = quadro?.atribuicoes.find((a) => a.userId === userId && a.date === date);
    setSelecao({ userId, date, modo: "turno" });
    setTurno(existente?.shiftCode ?? null);
    setJustificacao("");
    setErro(null);
  }

  if (loading) {
    return <div className="h-80 animate-pulse rounded-2xl bg-white shadow-card" />;
  }
  if (!quadro) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {erro ?? "Sem dados."}
      </div>
    );
  }

  const dias = eachDate(quadro.from, quadro.to);
  const jornalistas = quadro.membros.filter((m) => m.papel === "jornalista");
  const coordenadores = quadro.membros.filter((m) => m.papel === "coordenador");
  const conformidade = new Map(quadro.conformidade.map((c) => [c.userId, c]));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Redação</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Escalas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            As regras de descanso são o funcionamento normal. Quando uma atribuição as viola, o aviso aparece antes de
            confirmar e só fica gravado com justificação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-line bg-surface">
            <button
              type="button"
              className="px-2 py-2 text-slate-500 hover:text-slate-900"
              onClick={() => carregar(addDays(quadro.from, -7)).then(setQuadro).catch((e) => setErro(String(e)))}
              aria-label="Semana anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-40 px-1 text-center text-sm font-medium text-slate-800">
              {formatRange(quadro.from, quadro.to)}
            </span>
            <button
              type="button"
              className="px-2 py-2 text-slate-500 hover:text-slate-900"
              onClick={() => carregar(addDays(quadro.from, 7)).then(setQuadro).catch((e) => setErro(String(e)))}
              aria-label="Semana seguinte"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {quadro.podeGerir && (
            <>
              <Button variant="outline" onClick={() => setRegrasAbertas(true)}>
                Regras
              </Button>
              <Button
                onClick={async () => {
                  setErro(null);
                  setAGravar(true);
                  try {
                    const res = await fetch("/api/escalas/sugerir", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ from: quadro.from, to: quadro.to }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "A sugestão falhou.");
                    setExcluirAvisos(false);
                    setJustificacaoLote("");
                    setSugestao(data);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : "A sugestão falhou.");
                  } finally {
                    setAGravar(false);
                  }
                }}
              >
                Sugestão da semana
              </Button>
            </>
          )}
        </div>
      </header>

      {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <TriangleAlert size={14} className="text-orange-500" /> Exceção autorizada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleAlert size={14} className="text-red-600" /> Abaixo do necessário
        </span>
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-800">Férias</span>
        <span>Folga = célula vazia. Férias não contam como folga.</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-semibold">Jornalista</th>
              {dias.map((date) => (
                <th
                  key={date}
                  className={cn(
                    "px-2 py-3 font-semibold",
                    date === quadro.today && "bg-brand-50 text-brand-700",
                    fimDeSemana(date) && date !== quadro.today && "bg-slate-50"
                  )}
                >
                  <div className="capitalize">{formatWeekdayShort(date)}</div>
                  <div className="text-sm font-medium normal-case text-slate-700">{formatDayMonth(date)}</div>
                  <FaltasDoDia quadro={quadro} date={date} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jornalistas.map((membro) => {
              const c = conformidade.get(membro.userId);
              const excecaoVisivel = quadro.atribuicoes.some(
                (a) => a.userId === membro.userId && a.excecao && a.date >= quadro.from && a.date <= quadro.to
              );
              return (
                <tr key={membro.userId} className="border-b border-line last:border-0">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => {
                        setSelecao({ userId: membro.userId, date: quadro.today, modo: "conformidade" });
                        setErro(null);
                      }}
                    >
                      <span className="text-slate-900">{membro.nome}</span>
                      {excecaoVisivel && <TriangleAlert size={15} className="text-orange-500" aria-label="Exceção autorizada" />}
                      {c?.abaixoDoNecessario && (
                        <CircleAlert size={15} className="text-red-600" aria-label="Abaixo do necessário" />
                      )}
                    </button>
                    <p className="mt-0.5 text-[11px] font-normal text-slate-400">{membro.turnosPermitidos.join(" · ")}</p>
                  </th>
                  {dias.map((date) => {
                    const atribuicao = quadro.atribuicoes.find((a) => a.userId === membro.userId && a.date === date);
                    const ausencia = quadro.ausencias.find(
                      (a) => a.userId === membro.userId && a.date === date && a.estado === "aprovada"
                    );
                    const ativo = selecao?.modo === "turno" && selecao.userId === membro.userId && selecao.date === date;
                    return (
                      <td key={date} className={cn("px-1.5 py-1.5", date === quadro.today && "bg-brand-50/60", fimDeSemana(date) && date !== quadro.today && "bg-slate-50/80")}>
                        <button
                          type="button"
                          onClick={() => abrirCelula(membro.userId, date)}
                          className={cn(
                            "flex h-12 w-full items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors",
                            ativo ? "border-brand-500 ring-2 ring-brand-500/20" : "border-transparent hover:border-slate-200",
                            atribuicao
                              ? cn(COR_TURNO[atribuicao.shiftCode] ?? "bg-slate-100", atribuicao.excecao && "ring-2 ring-orange-400")
                              : ausencia
                                ? "bg-indigo-50 text-indigo-800"
                                : "bg-slate-50 text-slate-300"
                          )}
                        >
                          {atribuicao ? (
                            <>
                              {atribuicao.excecao && <TriangleAlert size={12} className="text-orange-600" />}
                              {atribuicao.shiftCode}
                            </>
                          ) : ausencia ? (
                            ausencia.tipo === "ferias" ? "Férias" : "Ausência"
                          ) : (
                            "·"
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {coordenadores.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800">Equipa de exemplo</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...coordenadores, ...jornalistas].map((m) => (
              <li key={m.userId} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium text-slate-900">{m.nome}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">
                    {m.papel === "coordenador" ? "Coordenação" : "Jornalista"}
                  </span>
                </span>
                <span className="truncate text-xs text-slate-500">{m.email}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selecao && (
        <Overlay>
        <Painel
          quadro={quadro}
          selecao={selecao}
          turno={turno}
          justificacao={justificacao}
          aGravar={aGravar}
          conformidade={conformidade.get(selecao.userId)}
          onTurno={setTurno}
          onJustificacao={setJustificacao}
          onFechar={() => setSelecao(null)}
          onMudarModo={(modo) => setSelecao({ ...selecao, modo })}
          onGravado={async () => {
            await recarregar();
            setJustificacao("");
          }}
          onErro={setErro}
        />
        </Overlay>
      )}

      {regrasAbertas && (
        <Overlay>
        <ModalRegras
          settings={quadro.settings}
          onFechar={() => setRegrasAbertas(false)}
          onGravado={async () => {
            setRegrasAbertas(false);
            await recarregar();
          }}
        />
        </Overlay>
      )}

      {sugestao && (
        <Overlay>
        <ModalSugestao
          quadro={quadro}
          resultado={sugestao}
          excluirAvisos={excluirAvisos}
          justificacao={justificacaoLote}
          aGravar={aGravar}
          onExcluir={setExcluirAvisos}
          onJustificacao={setJustificacaoLote}
          onFechar={() => setSugestao(null)}
          onAplicar={async () => {
            const escolhidas = atribuicoesAConfirmar(sugestao.atribuicoes, excluirAvisos);
            if (escolhidas.length === 0) {
              setSugestao(null);
              return;
            }
            setAGravar(true);
            setErro(null);
            try {
              const res = await fetch("/api/escalas/lote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  atribuicoes: escolhidas.map((a) => ({ userId: a.userId, date: a.date, shiftCode: a.shiftCode })),
                  justificacao: justificacaoLote,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? data.problemas?.[0]?.error ?? "Não foi possível gravar o lote.");
              setSugestao(null);
              await carregar(quadro.from);
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Não foi possível gravar o lote.");
            } finally {
              setAGravar(false);
            }
          }}
        />
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function FaltasDoDia({ quadro, date }: { quadro: QuadroEscala; date: string }) {
  const faltas = quadro.slots
    .filter((s) => s.date === date)
    .map((s) => {
      const filled = quadro.atribuicoes.filter((a) => a.date === date && a.shiftCode === s.shiftCode).length;
      return { code: s.shiftCode, falta: Math.max(0, s.quantidade - filled) };
    })
    .filter((s) => s.falta > 0);
  if (faltas.length === 0) return null;
  return <div className="mt-1 text-[10px] font-medium normal-case text-red-600">{faltas.map((f) => f.code).join(" ")}</div>;
}

function Painel({
  quadro,
  selecao,
  turno,
  justificacao,
  aGravar,
  conformidade,
  onTurno,
  onJustificacao,
  onFechar,
  onMudarModo,
  onGravado,
  onErro,
}: {
  quadro: QuadroEscala;
  selecao: Selecao;
  turno: string | null;
  justificacao: string;
  aGravar: boolean;
  conformidade?: ConformidadeResumo;
  onTurno: (code: string) => void;
  onJustificacao: (value: string) => void;
  onFechar: () => void;
  onMudarModo: (modo: Selecao["modo"]) => void;
  onGravado: () => Promise<void>;
  onErro: (message: string) => void;
}) {
  const membro = quadro.membros.find((m) => m.userId === selecao.userId);
  const existente = quadro.atribuicoes.find((a) => a.userId === selecao.userId && a.date === selecao.date);
  const ausencia = quadro.ausencias.find((a) => a.userId === selecao.userId && a.date === selecao.date && a.estado === "aprovada");
  const avaliacao = useMemo(() => {
    if (!turno || !membro || selecao.modo !== "turno") return null;
    if (existente && existente.shiftCode === turno) return null;
    return avaliarAtribuicao(
      quadro,
      { userId: selecao.userId, date: selecao.date, shiftCode: turno },
      quadro.settings,
      { ignorarAtribuicaoId: existente ? existente.id : undefined }
    );
  }, [existente, membro, quadro, selecao, turno]);

  const hard = avaliacao?.hard ?? [];
  const warnings = avaliacao?.warnings ?? [];
  const podeForcar = hard.length === 0 && warnings.length > 0;
  const limpo = turno && hard.length === 0 && warnings.length === 0 && (!existente || existente.shiftCode !== turno);

  async function gravar() {
    if (!turno) return;
    onErro("");
    try {
      const res = await fetch("/api/escalas/atribuicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selecao.userId,
          date: selecao.date,
          shiftCode: turno,
          override: podeForcar,
          justificacao,
          substituir: Boolean(existente),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? data.hard?.[0]?.message ?? data.warnings?.[0]?.message ?? "Não foi possível atribuir.";
        onErro(msg);
        return;
      }
      await onGravado();
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível atribuir.");
    }
  }

  async function removerTurno(id: string) {
    const res = await fetch(`/api/escalas/atribuicoes?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      onErro(data.error ?? "Não foi possível retirar o turno.");
      return;
    }
    await onGravado();
  }

  async function marcarAfastamento(tipo: "ferias" | "ausencia") {
    const res = await fetch("/api/escalas/ausencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selecao.userId, date: selecao.date, tipo }),
    });
    const data = await res.json();
    if (!res.ok) {
      onErro(data.error ?? "Não foi possível marcar.");
      return;
    }
    await onGravado();
  }

  async function retirarAfastamento(id: string) {
    const res = await fetch(`/api/escalas/ausencias?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      onErro(data.error ?? "Não foi possível retirar.");
      return;
    }
    await onGravado();
  }

  return (
    <aside className="fixed inset-0 z-[80] flex justify-end bg-slate-950/30" role="dialog" aria-label="Detalhe do dia">
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{selecao.modo === "conformidade" ? "Conformidade" : formatLongDate(selecao.date)}</p>
            <h2 className="text-lg font-semibold text-slate-900">{membro?.nome}</h2>
            <p className="text-xs text-slate-500">{membro?.email}</p>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          <button
            type="button"
            onClick={() => onMudarModo("turno")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium", selecao.modo === "turno" ? "bg-brand-50 text-brand-700" : "text-slate-500")}
          >
            Turno
          </button>
          <button
            type="button"
            onClick={() => onMudarModo("conformidade")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium", selecao.modo === "conformidade" ? "bg-brand-50 text-brand-700" : "text-slate-500")}
          >
            Conformidade
          </button>
        </div>

        {selecao.modo === "conformidade" ? (
          <div className="flex-1 overflow-y-auto">
            <ConformidadePainel conformidade={conformidade} settings={quadro.settings} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {ausencia && (
              <div className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                {ausencia.tipo === "ferias" ? "Férias aprovadas" : "Ausência aprovada"}. Não é uma folga e não pode levar turno.
                {quadro.podeGerir && (
                  <button type="button" className="mt-2 block text-xs font-semibold underline" onClick={() => retirarAfastamento(ausencia.id)}>
                    Retirar
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {quadro.turnos.map((t) => {
                const permitido = membro?.turnosPermitidos.includes(t.code);
                return (
                  <button
                    key={t.code}
                    type="button"
                    disabled={!quadro.podeGerir || !permitido}
                    onClick={() => onTurno(t.code)}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40",
                      turno === t.code ? "border-brand-500 bg-brand-50" : "border-line"
                    )}
                  >
                    <span className="block font-semibold">{t.code}</span>
                    <span className="text-slate-500">
                      {t.inicio}–{t.fim}
                    </span>
                  </button>
                );
              })}
            </div>
            {turno === "S6" && (
              <p className="text-xs text-slate-500">
                O S6 tem 9h de relógio e acaba às 02:00 do dia seguinte. Conta só como este dia, e as horas a mais não entram no limite semanal.
              </p>
            )}

            {existente?.excecao && existente.shiftCode === turno && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
                <p className="flex items-center gap-1.5 font-medium">
                  <TriangleAlert size={14} /> Exceção já autorizada
                </p>
                <p className="mt-1 text-xs">{existente.excecao_justificacao}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide">{existente.excecao_codigos.join(" · ")}</p>
              </div>
            )}

          </div>
          <div className="max-h-[58%] space-y-3 overflow-y-auto border-t border-line bg-surface px-5 py-4">
            {hard.map((h) => (
              <div key={h.code} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">{h.message}</p>
                <p className="mt-1 text-xs">{h.detail}</p>
              </div>
            ))}
            {warnings.map((w) => (
              <div key={`${w.code}-${w.detail}`} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
                <p className="flex items-center gap-1.5 font-medium">
                  <TriangleAlert size={14} /> {w.message}
                </p>
                <p className="mt-1 text-xs">{w.detail}</p>
              </div>
            ))}
            {podeForcar && (
              <Textarea
                label="Justificação"
                value={justificacao}
                onChange={(e) => onJustificacao(e.target.value)}
                placeholder="Porque é que este turno se atribui mesmo assim?"
                className="min-h-20"
              />
            )}
            {quadro.podeGerir && (
              <div className="flex flex-col gap-2">
                {(limpo || podeForcar) && (
                  <Button
                    onClick={gravar}
                    disabled={aGravar || (podeForcar && justificacao.trim().length === 0)}
                    className={podeForcar ? "bg-orange-600 hover:bg-orange-700" : undefined}
                  >
                    {podeForcar ? "Atribuir mesmo assim" : existente ? "Substituir turno" : "Atribuir"}
                  </Button>
                )}
                {existente && (
                  <Button variant="outline" disabled={aGravar} onClick={() => removerTurno(existente.id)}>
                    Retirar turno
                  </Button>
                )}
                {!existente && !ausencia && (
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={aGravar} onClick={() => marcarAfastamento("ferias")}>
                      Marcar férias
                    </Button>
                    <Button variant="secondary" disabled={aGravar} onClick={() => marcarAfastamento("ausencia")}>
                      Marcar ausência
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ConformidadePainel({
  conformidade,
  settings,
}: {
  conformidade?: ConformidadeResumo;
  settings: EscalaSettings;
}) {
  if (!conformidade) return <p className="px-5 py-4 text-sm text-slate-500">Sem dados de conformidade.</p>;
  const itens = [
    {
      label: "Dias consecutivos hoje",
      value: String(conformidade.diasConsecutivosHoje),
      hint: `limite ${settings.maxDiasConsecutivos}${
        conformidade.ultimoBlocoAte ? ` · último bloco ${conformidade.ultimoBlocoDias} dias até ${formatDayMonth(conformidade.ultimoBlocoAte)}` : ""
      }`,
      mau: conformidade.diasConsecutivosHoje > settings.maxDiasConsecutivos,
    },
    {
      label: `Folgas nos últimos ${settings.janelaFolgasDias} dias`,
      value: String(conformidade.folgasUltimos14Dias),
      hint: `mínimo ${settings.folgasMinimasPor14Dias}. Férias à parte: ${conformidade.feriasUltimos14Dias}`,
      mau: conformidade.folgasUltimos14Dias < settings.folgasMinimasPor14Dias,
    },
    {
      label: "Horas na semana",
      value: `${conformidade.horasSemana}h`,
      hint: `limite ${settings.maxHorasSemanais}h. O S6 conta ${settings.duracaoPadraoTurnoHoras}h`,
      mau: conformidade.horasSemana > settings.maxHorasSemanais,
    },
  ];
  return (
    <div className="space-y-4 px-5 py-4">
      {conformidade.abaixoDoNecessario && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          <CircleAlert size={16} /> Abaixo do necessário
        </p>
      )}
      <ul className="space-y-3">
        {itens.map((item) => (
          <li key={item.label} className="rounded-xl border border-line px-3 py-2">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={cn("text-xl font-semibold", item.mau ? "text-red-700" : "text-slate-900")}>{item.value}</p>
            <p className="text-xs text-slate-500">{item.hint}</p>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Exceções autorizadas</h3>
        {conformidade.excecoes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {conformidade.excecoes.map((e) => (
              <li key={e.id} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-orange-950">
                  <TriangleAlert size={14} /> {formatDayMonth(e.date)} · {e.shiftCode}
                </p>
                <p className="mt-1 text-xs text-orange-900">{e.justificacao}</p>
                <p className="mt-1 text-[11px] text-orange-800">
                  {e.codigos.join(" · ")}
                  {e.autorizadaPorNome ? ` · ${e.autorizadaPorNome}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModalRegras({
  settings,
  onFechar,
  onGravado,
}: {
  settings: EscalaSettings;
  onFechar: () => void;
  onGravado: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const campos: { key: keyof EscalaSettings; label: string }[] = [
    { key: "maxDiasConsecutivos", label: "Máximo de dias consecutivos" },
    { key: "folgasMinimasPor14Dias", label: "Folgas mínimas na janela" },
    { key: "janelaFolgasDias", label: "Janela de folgas (dias)" },
    { key: "descansoMinimoHoras", label: "Descanso mínimo (horas)" },
    { key: "duracaoPadraoTurnoHoras", label: "Duração padrão do turno (horas)" },
    { key: "maxHorasSemanais", label: "Máximo de horas semanais" },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/30 p-4 sm:items-center">
      <form
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setAGravar(true);
          setErro(null);
          try {
            const res = await fetch("/api/escalas/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(draft),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Não foi possível gravar as regras.");
            await onGravado();
          } catch (err) {
            setErro(err instanceof Error ? err.message : "Não foi possível gravar as regras.");
          } finally {
            setAGravar(false);
          }
        }}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Regras</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-slate-400">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          O S6 conta como um dia — o dia em que começa — e as horas a mais não entram no limite. Férias aprovadas não são folgas.
          Com folgas agrupadas, a sugestão prefere blocos de trabalho e blocos de folga.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {campos.map((campo) => (
            <label key={campo.key} className="text-xs font-medium text-slate-600">
              {campo.label}
              <input
                type="number"
                step="0.5"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm"
                value={Number(draft[campo.key])}
                onChange={(e) => setDraft({ ...draft, [campo.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.preferirFolgasAgrupadas}
            onChange={(e) => setDraft({ ...draft, preferirFolgasAgrupadas: e.target.checked })}
          />
          Preferir folgas agrupadas
        </label>
        {erro && <p className="mt-3 text-sm text-red-700">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={aGravar}>
            Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

function ModalSugestao({
  quadro,
  resultado,
  excluirAvisos,
  justificacao,
  aGravar,
  onExcluir,
  onJustificacao,
  onFechar,
  onAplicar,
}: {
  quadro: QuadroEscala;
  resultado: ResultadoSugestao;
  excluirAvisos: boolean;
  justificacao: string;
  aGravar: boolean;
  onExcluir: (value: boolean) => void;
  onJustificacao: (value: string) => void;
  onFechar: () => void;
  onAplicar: () => Promise<void>;
}) {
  const nomes = new Map(quadro.membros.map((m) => [m.userId, m.nome]));
  const visiveis = atribuicoesAConfirmar(resultado.atribuicoes, excluirAvisos);
  const comAviso = visiveis.filter((a) => a.excecao);
  const nome = (userId: string) => nomes.get(userId) ?? userId;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/30 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pré-visualização</h2>
            <p className="text-sm text-slate-500">
              {visiveis.length} atribuições. Os bloqueios não entram. Os avisos entram, salvo se os excluíres.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-slate-400">
            <X size={18} />
          </button>
        </div>

        <Seccao titulo="Avisos incluídos" tom="orange">
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={excluirAvisos} onChange={(e) => onExcluir(e.target.checked)} />
            Excluir os que geram aviso
          </label>
          {comAviso.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum aviso neste lote.</p>
          ) : (
            <ListaAtribuicoes items={comAviso} nome={nome} />
          )}
          {comAviso.length > 0 && (
            <Textarea
              label="Justificação do lote"
              className="mt-3 min-h-20"
              value={justificacao}
              onChange={(e) => onJustificacao(e.target.value)}
              placeholder="Aplica-se a todas as exceções que forem gravadas."
            />
          )}
        </Seccao>

        <Seccao titulo="Atribuir" tom="slate">
          {visiveis.length === 0 ? <p className="text-sm text-slate-500">Nada para gravar.</p> : <ListaAtribuicoes items={visiveis} nome={nome} />}
        </Seccao>

        <Seccao titulo="Bloqueios saltados" tom="red">
          {resultado.bloqueios.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum lugar ficou vazio por uma regra absoluta.</p>
          ) : (
            <ul className="space-y-1 text-sm text-red-900">
              {resultado.bloqueios.map((b, i) => (
                <li key={`${b.userId}-${b.date}-${b.shiftCode}-${i}`}>
                  {nome(b.userId)} · {formatDayMonth(b.date)} · {b.shiftCode}: {b.message}
                </li>
              ))}
            </ul>
          )}
          {resultado.porPreencher.length > 0 && (
            <p className="mt-2 text-xs text-red-800">
              Por preencher: {resultado.porPreencher.map((p) => `${p.shiftCode} ${formatDayMonth(p.date)}`).join(", ")}
            </p>
          )}
        </Seccao>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={aGravar || visiveis.length === 0 || (comAviso.length > 0 && justificacao.trim().length === 0)}
            onClick={() => void onAplicar()}
          >
            Gravar {visiveis.length}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Seccao({ titulo, tom, children }: { titulo: string; tom: "orange" | "red" | "slate"; children: React.ReactNode }) {
  const borda = tom === "orange" ? "border-orange-200" : tom === "red" ? "border-red-200" : "border-line";
  return (
    <section className={cn("mt-4 rounded-xl border p-3", borda)}>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{titulo}</h3>
      {children}
    </section>
  );
}

function ListaAtribuicoes({
  items,
  nome,
}: {
  items: ResultadoSugestao["atribuicoes"];
  nome: (userId: string) => string;
}) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((a) => (
        <li key={`${a.userId}-${a.date}-${a.shiftCode}`} className="flex items-start justify-between gap-3">
          <span>
            {nome(a.userId)} · {formatDayMonth(a.date)} · {a.shiftCode}
          </span>
          {a.excecao && (
            <span className="inline-flex items-center gap-1 text-xs text-orange-700">
              <TriangleAlert size={12} /> {a.warnings.map((w) => w.message).join("; ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function fimDeSemana(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}
