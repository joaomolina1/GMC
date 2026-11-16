"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check as CheckIcon, ChevronLeft, ChevronRight, Copy, Eraser, ListPlus, Pencil, Sparkles, XCircle } from "lucide-react";
import { cn } from "@lib/utils";
import { addDays, DIAS, dow, dRange, fmt, fmtDMY, fmtFull, isoWeek, isWE, mondayOf, todayISO } from "@lib/escalas/datas";
import type { Lacuna, Motor, Proposta } from "@lib/escalas/motor";
import { ORIGEM_LABEL, REGRA_LABEL, type Aviso, type Pessoa, type Periodo } from "@lib/escalas/tipos";
import { ErroApi, ok, sb, useAcoes, useMotor } from "../_lib/contexto";
import { Av, Button, Card, Check, Drawer, Field, inputCls, inputSm, Kpi, Kpis, Loading, Modal, Note, SecHead, Table, Tag, useDialogo } from "./ui";

const LS = "escalas-grelha";

export function Grelha() {
  const hoje = todayISO();
  const [ws, setWs] = useState(mondayOf(hoje));
  const [grupo, setGrupo] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [celula, setCelula] = useState<{ d: string; s: string } | null>(null);
  const [modal, setModal] = useState<null | "sugerir" | "sugerirTodos" | "copiar" | "limpar" | "massa">(null);
  const { motor, loading, error } = useMotor(addDays(ws, -70), addDays(ws, 20));

  useEffect(() => {
    try {
      const g = localStorage.getItem(LS);
      if (g) setGrupo(g);
    } catch {}
  }, []);
  useEffect(() => {
    if (motor && (!grupo || !motor.grupo(grupo)?.ativo)) setGrupo(motor.grupos[0]?.id ?? null);
  }, [motor, grupo]);
  const escolherGrupo = (g: string) => {
    setGrupo(g);
    try {
      localStorage.setItem(LS, g);
    } catch {}
  };

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  if (!grupo || !motor.grupo(grupo)) return <Note>Crie um grupo em Configuração.</Note>;
  const G = grupo;
  const days = dRange(ws, addDays(ws, 6));

  let min = 0;
  let fill = 0;
  let exc = 0;
  for (const d of days)
    for (const s of motor.slots) {
      const [mn, mx] = motor.demanda(G, d, s.id);
      min += mn;
      const a = motor.atribuidos(d, s.id, G);
      fill += Math.min(a.length, mx || a.length, mn);
      exc += a.filter((p) => motor.entradaDe(p.id, d)?.excecao).length;
    }
  const pcs = days.map((d) => motor.verificarPeriodo(G, d)).filter((x) => x && !x.na);
  const pendentes = motor.ds.ausencias.filter((a) => a.estado === "PENDENTE").length;
  const alertas = motor.alertasSemana(G, days);
  const g = motor.grupo(G)!;
  const minimos = Object.entries(g.minimos).filter(([, v]) => (v ?? 0) > 0) as [Periodo, number][];

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {motor.grupos.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => escolherGrupo(x.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              x.id === G ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {x.nome} <span className={cn("ml-1 text-xs", x.id === G ? "text-white/80" : "text-slate-400")}>{motor.membros(x.id).length}</span>
          </button>
        ))}
      </div>

      <Kpis>
        <Kpi label="Cobertura do mínimo" value={`${fill}/${min}`} sub={`${min ? Math.round((fill / min) * 100) : 100}% dos lugares mínimos`} frac={min ? fill / min : 1} />
        <Kpi label="Por preencher" value={Math.max(min - fill, 0)} sub={min - fill > 0 ? "lugares abaixo do mínimo" : "mínimo garantido"} />
        <Kpi label="Com exceção" value={exc} sub={exc ? "regras flexíveis forçadas" : "nenhuma regra forçada"} />
        {pcs.length ? (
          <Kpi label="Mínimo por período" value={`${pcs.filter((x) => x!.ok).length}/${pcs.length}`} sub="dias úteis cumpridos" />
        ) : (
          <Kpi label="Pedidos pendentes" value={pendentes} sub="aguardam decisão" />
        )}
      </Kpis>

      <Card
        title={`${g.nome} · semana ${isoWeek(ws)} · ${fmt(days[0])} a ${fmt(days[6])}`}
        sub="Clique numa célula para gerir · riscado = sem necessidade definida · ponto azul = necessidade alterada para o dia"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWs(addDays(ws, -7))} title="Semana anterior">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWs(mondayOf(hoje))}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWs(addDays(ws, 7))} title="Semana seguinte">
              <ChevronRight size={16} />
            </Button>
            <input type="date" className={cn(inputSm, "w-36")} value={ws} onChange={(e) => e.target.value && setWs(mondayOf(e.target.value))} />
          </>
        }
        toolbar={
          <>
            <Button variant={editar ? "secondary" : "outline"} size="sm" onClick={() => setEditar(!editar)}>
              {editar ? <CheckIcon size={14} /> : <Pencil size={14} />}
              {editar ? "A editar necessidades" : "Editar necessidades"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal("copiar")}>
              <Copy size={14} /> Copiar semana anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal("limpar")}>
              <Eraser size={14} /> Limpar semana
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal("massa")}>
              <ListPlus size={14} /> Atribuição em massa
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal("sugerirTodos")}>
              Sugerir todos os grupos
            </Button>
            <Button size="sm" onClick={() => setModal("sugerir")}>
              <Sparkles size={14} /> Sugerir escala
            </Button>
          </>
        }
        bodyClass="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-28 border-b border-r border-line bg-slate-50 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">Slot</th>
                {days.map((d) => {
                  const fer = motor.feriado(d);
                  return (
                    <th
                      key={d}
                      className={cn(
                        "border-b border-line px-2 py-2 text-left font-medium",
                        isWE(d) || fer ? "bg-slate-100/70" : "bg-slate-50",
                        d === hoje && "bg-brand-50"
                      )}
                    >
                      <div className={cn("text-[11px] uppercase tracking-wide", d === hoje ? "text-brand-600" : "text-slate-500")}>{DIAS[dow(d)]}</div>
                      <div className="text-sm text-slate-900">{fmt(d)}</div>
                      {fer && (
                        <div className="truncate text-[10.5px] font-medium text-rose-600" title={fer.nome}>
                          {fer.nome}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {motor.slots.map((s) => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-white px-3 py-2 align-top">
                    <div className="font-semibold text-slate-900">{s.etiqueta}</div>
                    <div className="text-[11px] text-slate-500">
                      {motor.periodos[s.periodo]} · {s.horas}h
                    </div>
                    {s.piquete && <Tag kind="brand" className="mt-1">piquete</Tag>}
                  </td>
                  {days.map((d) => (
                    <td key={d} className={cn("border-b border-line p-1.5 align-top", (isWE(d) || motor.feriado(d)) && "bg-slate-50/60")}>
                      <Celula motor={motor} d={d} sid={s.id} G={G} editar={editar} onOpen={() => setCelula({ d, s: s.id })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {minimos.length > 0 && (
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 border-r border-line bg-white px-3 py-2">
                    <div className="text-[11.5px] font-semibold text-slate-900">Mínimo por período</div>
                    <div className="text-[11px] text-slate-500">{minimos.map(([k, v]) => `${v} ${motor.periodos[k].toLowerCase()}`).join(" + ")}</div>
                  </td>
                  {days.map((d) => {
                    const x = motor.verificarPeriodo(G, d);
                    return (
                      <td key={d} className="px-1.5 py-2">
                        <div className="flex flex-wrap gap-1">
                          {!x ? null : x.na ? (
                            <Tag>não se aplica</Tag>
                          ) : (
                            minimos.map(([k, v]) => (
                              <Tag key={k} kind={x.c[k] >= v ? "ok" : "bad"}>
                                {k} {x.c[k]}/{v}
                              </Tag>
                            ))
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />mínimo cumprido</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500" />abaixo do mínimo</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />acima do máximo ou exceção</span>
          <span>“livres” = pessoas do grupo ainda sem bloqueio para o slot</span>
        </div>
      </Card>

      <Card title="Alertas da semana" sub={alertas.length ? `${alertas.length} ponto(s) a rever` : "nada a assinalar"}>
        {!alertas.length && <Note kind="ok">Sem alertas para este grupo nesta semana.</Note>}
        {alertas.map((a, i) => (
          <Note key={i} kind={a.k}>
            {a.texto}
          </Note>
        ))}
        {g.estimado && (
          <Note>
            As necessidades de <b>{g.nome}</b> não vinham no documento original: os valores padrão são estimativas. Ajuste-as em Configuração.
          </Note>
        )}
      </Card>

      {celula && <PainelCelula motor={motor} d={celula.d} sid={celula.s} G={G} ws={ws} onClose={() => setCelula(null)} />}
      {(modal === "sugerir" || modal === "sugerirTodos") && <ModalSugestao motor={motor} ws={ws} G={modal === "sugerir" ? G : null} onClose={() => setModal(null)} />}
      {modal === "copiar" && <ModalCopiar motor={motor} ws={ws} G={G} onClose={() => setModal(null)} />}
      {modal === "limpar" && <ModalLimpar motor={motor} ws={ws} G={G} onClose={() => setModal(null)} />}
      {modal === "massa" && <ModalMassa motor={motor} ws={ws} G={G} onClose={() => setModal(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- célula
function Celula({ motor, d, sid, G, editar, onOpen }: { motor: Motor; d: string; sid: string; G: string; editar: boolean; onOpen: () => void }) {
  const [mn, mx] = motor.demanda(G, d, sid);
  const a = motor.atribuidos(d, sid, G);
  const av = motor.disponiveis(d, sid, G).length;
  const sem = mn === 0 && mx === 0 && !a.length;
  const cls = mn === 0 && mx === 0 ? (a.length ? "over" : "none") : a.length < mn ? "short" : a.length > mx ? "over" : "ok";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "min-h-[74px] cursor-pointer rounded-lg border p-1.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40",
        sem ? "border-dashed border-slate-200 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(241_245_249)_6px,rgb(241_245_249)_7px)]" : "border-slate-200 bg-white"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {editar ? (
          <EditarNecessidade motor={motor} d={d} sid={sid} G={G} />
        ) : (
          <>
            <span
              className={cn(
                "rounded-md px-1.5 text-[11.5px] font-semibold",
                cls === "short" && "bg-red-100 text-red-700",
                cls === "ok" && "bg-emerald-100 text-emerald-700",
                cls === "over" && "bg-amber-100 text-amber-800",
                cls === "none" && "text-slate-400"
              )}
            >
              {a.length}/{mn === mx ? mn : `${mn}–${mx}`}
            </span>
            <span className={cn("text-[11px]", av <= 1 && a.length < mn ? "font-semibold text-red-600" : "text-slate-400")}>{av} livres</span>
            {motor.isOverride(G, d, sid) && <span className="ml-auto h-2 w-2 rounded-full bg-brand-500" title="Necessidade alterada para o dia" />}
          </>
        )}
      </div>
      {a.slice(0, 3).map((p) => {
        const e = motor.entradaDe(p.id, d);
        return (
          <div
            key={p.id}
            className={cn("mb-0.5 flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[12px]", e?.excecao ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700")}
          >
            {e?.excecao && <AlertTriangle size={11} className="shrink-0" />}
            <span className="truncate">{p.nome}</span>
          </div>
        );
      })}
      {a.length > 3 && <div className="text-[11px] text-slate-500">mais {a.length - 3}</div>}
    </div>
  );
}

function useGuardarNecessidade() {
  const { registar, refrescar } = useAcoes();
  const { toast } = useDialogo();
  return async (motor: Motor, d: string, G: string, sid: string, val: [number, number] | null) => {
    try {
      if (val === null) ok(await sb().from("escala_necessidades_dia").delete().match({ data: d, grupo_id: G, slot_id: sid }));
      else ok(await sb().from("escala_necessidades_dia").upsert({ data: d, grupo_id: G, slot_id: sid, minimo: val[0], maximo: val[1] }));
      await registar(
        "Necessidade alterada",
        `${motor.nomeGrupo(G)} · ${fmtDMY(d)} ${motor.slot(sid)?.etiqueta} → ${val ? val.join("–") : "padrão"}`
      );
      await refrescar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível guardar.", "bad");
    }
  };
}

function EditarNecessidade({ motor, d, sid, G }: { motor: Motor; d: string; sid: string; G: string }) {
  const guardar = useGuardarNecessidade();
  const cur = motor.demanda(G, d, sid);
  const set = (i: 0 | 1, v: number) => {
    const n: [number, number] = [cur[0], cur[1]];
    n[i] = Math.max(0, v || 0);
    if (i === 0 && n[1] < n[0]) n[1] = n[0];
    if (i === 1 && n[0] > n[1]) n[0] = n[1];
    guardar(motor, d, G, sid, n);
  };
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input type="number" min={0} max={20} defaultValue={cur[0]} onBlur={(e) => +e.target.value !== cur[0] && set(0, +e.target.value)} className={cn(inputSm, "w-11 px-1 text-center")} />
      <span className="text-slate-400">–</span>
      <input type="number" min={0} max={20} defaultValue={cur[1]} onBlur={(e) => +e.target.value !== cur[1] && set(1, +e.target.value)} className={cn(inputSm, "w-11 px-1 text-center")} />
    </div>
  );
}

// ---------------------------------------------------------------- painel da célula
function PainelCelula({ motor, d, sid, G, ws, onClose }: { motor: Motor; d: string; sid: string; G: string; ws: string; onClose: () => void }) {
  const { aplicarTurnos } = useAcoes();
  const { toast, pedirTexto } = useDialogo();
  const guardarNec = useGuardarNecessidade();
  const slot = motor.slot(sid)!;
  const [mn, mx] = motor.demanda(G, d, sid);
  const [n0, setN0] = useState(mn);
  const [n1, setN1] = useState(mx);
  useEffect(() => {
    setN0(mn);
    setN1(mx);
  }, [mn, mx]);
  const a = motor.atribuidos(d, sid, G);
  const pc = motor.verificarPeriodo(G, d);
  const stats = useMemo(() => motor.estatSemana(G, ws), [motor, G, ws]);
  const [aGravar, setAGravar] = useState<string | null>(null);

  const grupos = { ok: [] as { p: Pessoa; soft: Aviso[] }[], warn: [] as { p: Pessoa; soft: Aviso[] }[], bad: [] as { p: Pessoa; hard: string[] }[] };
  for (const p of motor.membros(G)) {
    if (a.includes(p)) continue;
    const r = motor.verificar(p.id, d, sid);
    if (r.hard.length) grupos.bad.push({ p, hard: r.hard });
    else if (r.soft.length) grupos.warn.push({ p, soft: r.soft });
    else grupos.ok.push({ p, soft: [] });
  }

  async function atribuir(p: Pessoa, soft: Aviso[]) {
    let just = "";
    if (soft.length) {
      const t = await pedirTexto({
        titulo: "Confirmar exceção",
        texto: (
          <Note kind="warn">
            <b>{p.nome}</b>: esta atribuição viola regras flexíveis:
            <ul className="mt-1 list-disc pl-5">
              {soft.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
            <div className="mt-1 text-xs">Fica registada com a data, quem autorizou e as regras violadas.</div>
          </Note>
        ),
        label: "Justificação da exceção (obrigatória)",
        placeholder: "Ex.: cobertura de acontecimento imprevisto, acordado com o trabalhador.",
        ok: "Atribuir mesmo assim",
      });
      if (!t) return;
      just = t;
    }
    setAGravar(p.id);
    try {
      await aplicarTurnos({
        atribuir: [{ data: d, slotId: sid, pessoaId: p.id, origem: "MANUAL", justificacao: just }],
        registo: {
          acao: soft.length ? "Turno com exceção" : "Turno atribuído",
          detalhe: `${p.nome} · ${fmtDMY(d)} ${slot.etiqueta}` + (soft.length ? ` · ${soft.map((w) => REGRA_LABEL[w.code]).join(", ")} · “${just}”` : ""),
        },
      });
      toast("Turno atribuído.", "ok");
    } catch (e) {
      toast(e instanceof ErroApi && e.erros[0] ? e.erros[0].motivo : e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(null);
    }
  }

  async function retirar(p: Pessoa) {
    setAGravar(p.id);
    try {
      await aplicarTurnos({ retirar: [{ data: d, pessoaId: p.id }], registo: { acao: "Turno retirado", detalhe: `${p.nome} · ${fmtDMY(d)} ${slot.etiqueta}` } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(null);
    }
  }

  const idx = (p: Pessoa) => motor.grupos.findIndex((g) => g.id === p.grupoId);

  return (
    <Drawer open title={`${slot.etiqueta} · ${motor.periodos[slot.periodo]}`} sub={`${motor.nomeGrupo(G)} · ${fmtFull(d)}${motor.feriado(d) ? ` · ${motor.feriado(d)!.nome}` : ""}`} onClose={onClose}>
      <Note kind={a.length < mn ? "bad" : a.length > mx ? "warn" : "ok"}>
        {a.length < mn
          ? `Faltam ${mn - a.length} (${a.length} de ${mn} no mínimo).`
          : a.length > mx
            ? `Acima do máximo previsto (${a.length}/${mx}).`
            : `Dentro do previsto: ${a.length} de ${mn === mx ? mn : `${mn}–${mx}`}.`}
      </Note>
      {slot.piquete && (
        <Note>
          Slot de <b>piquete</b>
          {slot.nota ? ` — ${slot.nota}` : ""}. {motor.regras.piqueteDiasSeguidos} dias seguidos dão direito a {motor.regras.piqueteFolgas} folgas.
        </Note>
      )}
      {pc && !pc.na && (
        <Note kind={pc.ok ? "ok" : "bad"}>
          Mínimo por período neste dia:{" "}
          {(Object.entries(pc.m) as [Periodo, number][])
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${pc.c[k]}/${v} ${motor.periodos[k].toLowerCase()}`)
            .join(" · ")}
          .
        </Note>
      )}

      <SecHead>Necessidade deste dia</SecHead>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">mín.</span>
        <input type="number" min={0} max={20} value={n0} onChange={(e) => setN0(Math.max(0, +e.target.value || 0))} className={cn(inputSm, "w-16")} />
        <span className="text-xs text-slate-500">máx.</span>
        <input type="number" min={0} max={20} value={n1} onChange={(e) => setN1(Math.max(0, +e.target.value || 0))} className={cn(inputSm, "w-16")} />
        <Button size="sm" variant="outline" onClick={() => guardarNec(motor, d, G, sid, [n0, Math.max(n0, n1)])}>
          Guardar
        </Button>
        {motor.isOverride(G, d, sid) && (
          <Button size="sm" variant="ghost" onClick={() => guardarNec(motor, d, G, sid, null)}>
            Repor padrão
          </Button>
        )}
      </div>

      <SecHead>Atribuídos ({a.length})</SecHead>
      {!a.length && <Note>Ninguém atribuído.</Note>}
      {a.map((p) => {
        const e = motor.entradaDe(p.id, d);
        return (
          <div key={p.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
            <Av nome={p.nome} idx={idx(p)} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{p.nome}</div>
              {e?.excecao ? (
                <div className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle size={12} /> exceção · {e.excecaoRegras.map((c) => REGRA_LABEL[c]).join(", ")}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  {motor.prefTxt(p)} · {e ? ORIGEM_LABEL[e.origem] : ""}
                </div>
              )}
              {e?.excecao && e.justificacao && <div className="text-xs text-slate-500">“{e.justificacao}”</div>}
            </div>
            <Button size="sm" variant="outline" disabled={aGravar === p.id} onClick={() => retirar(p)}>
              Retirar
            </Button>
          </div>
        );
      })}

      <SecHead>Livres sem aviso ({grupos.ok.length})</SecHead>
      {!grupos.ok.length && <Note>Ninguém totalmente livre neste grupo.</Note>}
      {grupos.ok.map(({ p }) => {
        const st = stats[p.id] ?? { t: 0, fds: 0, piq: 0 };
        return (
          <div key={p.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <Av nome={p.nome} idx={idx(p)} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{p.nome}</div>
              <div className="text-xs text-slate-500">
                {st.t} turnos · {st.fds} fds · {st.piq} piquetes (8 sem.) · {motor.folgasPior(p.id, d).livres} folgas/{motor.regras.janelaFolgas}d
              </div>
            </div>
            <Button size="sm" disabled={aGravar === p.id} onClick={() => atribuir(p, [])}>
              Atribuir
            </Button>
          </div>
        );
      })}
      {grupos.warn.length > 0 && <SecHead>Com aviso ({grupos.warn.length}): regra flexível</SecHead>}
      {grupos.warn.map(({ p, soft }) => (
        <div key={p.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
          <Av nome={p.nome} idx={idx(p)} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900">{p.nome}</div>
            {soft.map((w, i) => (
              <div key={i} className="flex items-start gap-1 text-xs text-amber-700">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {w.message}
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={aGravar === p.id} onClick={() => atribuir(p, soft)}>
            Forçar
          </Button>
        </div>
      ))}
      {grupos.bad.length > 0 && <SecHead>Bloqueados ({grupos.bad.length})</SecHead>}
      {grupos.bad.map(({ p, hard }) => (
        <div key={p.id} className="flex items-start gap-3 border-b border-line py-2.5 opacity-60 last:border-0">
          <Av nome={p.nome} idx={idx(p)} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900">{p.nome}</div>
            {hard.map((h, i) => (
              <div key={i} className="flex items-start gap-1 text-xs text-red-700">
                <XCircle size={12} className="mt-0.5 shrink-0" />
                {h}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Drawer>
  );
}

// ---------------------------------------------------------------- sugestão
function ModalSugestao({ motor, ws, G, onClose }: { motor: Motor; ws: string; G: string | null; onClose: () => void }) {
  const { aplicarTurnos } = useAcoes();
  const { toast } = useDialogo();
  const [max, setMax] = useState(false);
  const r = useMemo<{ props: Proposta[]; gaps: Lacuna[] }>(
    () => (G ? motor.sugerir(ws, G, { preencherMax: max }) : motor.sugerirTodos(ws, { preencherMax: max })),
    [motor, ws, G, max]
  );
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => setSel(new Set(r.props.map((_, i) => i))), [r]);
  const [aGravar, setAGravar] = useState(false);
  const faltam = r.gaps.reduce((n, g) => n + g.falta, 0);
  const excs = r.props.filter((p) => p.soft.length).length;

  async function aceitar() {
    const keep = r.props.filter((_, i) => sel.has(i));
    if (!keep.length) return onClose();
    setAGravar(true);
    try {
      await aplicarTurnos({
        atribuir: keep.map((p) => ({
          data: p.data,
          slotId: p.slotId,
          pessoaId: p.pessoaId,
          origem: "SUGESTAO",
          justificacao: p.soft.length ? "Aceite a partir da sugestão automática." : "",
        })),
        registo: { acao: "Sugestão aplicada", detalhe: `${keep.length} turnos · ${G ? motor.nomeGrupo(G) : "todos os grupos"} · semana ${isoWeek(ws)}` },
      });
      toast(`${keep.length} turnos atribuídos.`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof ErroApi && e.erros[0] ? `${e.message} ${e.erros[0].nome}: ${e.erros[0].motivo}` : e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal
      open
      wide
      title={`Sugestão · ${G ? motor.nomeGrupo(G) : "todos os grupos"} · semana ${isoWeek(ws)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Descartar
          </Button>
          <Button size="sm" disabled={aGravar || !sel.size} onClick={aceitar}>
            Aceitar selecionadas ({sel.size})
          </Button>
        </>
      }
    >
      <Note kind={r.gaps.length ? "warn" : "ok"}>
        {r.props.length ? (
          <>
            Proposta de <b>{r.props.length}</b> atribuições. {faltam ? <><b>{faltam}</b> lugar(es) ficam por preencher.</> : "O mínimo fica todo coberto."} Exceções propostas: <b>{excs}</b>.
          </>
        ) : r.gaps.length ? (
          "Não há candidatos possíveis para os lugares em falta."
        ) : (
          "Nada a propor: o mínimo já está coberto nesta semana."
        )}
      </Note>
      <div className="mb-3">
        <Check label="Completar também até ao máximo (apenas sem exceções)" checked={max} onChange={setMax} />
      </div>
      {r.props.length > 0 && (
        <>
          <SecHead>Atribuições propostas ({r.props.length})</SecHead>
          <Table>
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    className="accent-brand-500"
                    checked={sel.size === r.props.length}
                    onChange={(e) => setSel(e.target.checked ? new Set(r.props.map((_, i) => i)) : new Set())}
                  />
                </th>
                <th>Dia</th>
                <th>Slot</th>
                <th>Pessoa</th>
                <th>Porquê</th>
              </tr>
            </thead>
            <tbody>
              {r.props.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="checkbox"
                      className="accent-brand-500"
                      checked={sel.has(i)}
                      onChange={(e) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(i);
                        else n.delete(i);
                        setSel(n);
                      }}
                    />
                  </td>
                  <td className="whitespace-nowrap">
                    {DIAS[dow(p.data)]} {fmt(p.data)}
                  </td>
                  <td className="whitespace-nowrap">
                    <b>{motor.slot(p.slotId)?.etiqueta}</b> {motor.slot(p.slotId)?.piquete && <Tag kind="brand">piquete</Tag>}
                  </td>
                  <td className="whitespace-nowrap">
                    {motor.pessoa(p.pessoaId)?.nome} {!G && <Tag>{motor.nomeGrupo(p.grupoId)}</Tag>}
                  </td>
                  <td className="text-xs text-slate-500">
                    {p.soft.length ? (
                      <>
                        <Tag kind="warn">exceção</Tag> {p.soft.map((w) => w.message).join("; ")}
                      </>
                    ) : (
                      p.razao
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
      {r.gaps.length > 0 && (
        <>
          <SecHead>Ficam por preencher</SecHead>
          {r.gaps.map((g, i) => (
            <Note key={i} kind="bad">
              <b>
                {DIAS[dow(g.data)]} {fmt(g.data)} · {motor.slot(g.slotId)?.etiqueta}
              </b>
              {!G && ` · ${motor.nomeGrupo(g.grupoId)}`} — faltam {g.falta}: {g.motivo}.
            </Note>
          ))}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- copiar / limpar / massa
function ModalCopiar({ motor, ws, G, onClose }: { motor: Motor; ws: string; G: string; onClose: () => void }) {
  const { aplicarTurnos } = useAcoes();
  const { toast } = useDialogo();
  const [incW, setIncW] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const src = addDays(ws, -7);
  const rows = useMemo(() => {
    const out: { d: string; s: string; u: string; hard: string[]; soft: Aviso[] }[] = [];
    for (const sd of dRange(src, addDays(src, 6)))
      for (const p of motor.membros(G)) {
        const s = motor.turnoDe(p.id, sd);
        if (!s || !motor.slot(s)?.ativo) continue;
        const d = addDays(sd, 7);
        if (motor.turnoDe(p.id, d)) continue;
        const r = motor.verificar(p.id, d, s);
        out.push({ d, s, u: p.id, ...r });
      }
    return out;
  }, [motor, G, src]);
  const okR = rows.filter((x) => !x.hard.length && !x.soft.length);
  const w = rows.filter((x) => !x.hard.length && x.soft.length);
  const b = rows.filter((x) => x.hard.length);

  async function copiar() {
    const list = okR.concat(incW ? w : []);
    if (!list.length) return onClose();
    setAGravar(true);
    try {
      await aplicarTurnos({
        atribuir: list.map((x) => ({ data: x.d, slotId: x.s, pessoaId: x.u, origem: "COPIA", justificacao: x.soft.length ? "Copiado da semana anterior com aviso." : "" })),
        registo: { acao: "Semana copiada", detalhe: `${motor.nomeGrupo(G)} · ${list.length} turnos · semana ${isoWeek(ws)}` },
      });
      toast(`${list.length} turnos copiados.`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal
      open
      title="Copiar semana anterior"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={aGravar} onClick={copiar}>
            Copiar
          </Button>
        </>
      }
    >
      <Note>
        Copia os turnos de <b>{motor.nomeGrupo(G)}</b> da semana de {fmt(src)} para a semana de {fmt(ws)}, para quem ainda não tem turno nesse dia.
        <br />
        <b>{okR.length}</b> sem problema · <b>{w.length}</b> com aviso · <b>{b.length}</b> bloqueados (férias, pedidos aprovados, preferências).
      </Note>
      <Check label="Incluir também os que geram aviso (ficam marcados como exceção)" checked={incW} onChange={setIncW} />
      {b.length > 0 && <SecHead>Não copiados</SecHead>}
      {b.slice(0, 30).map((x, i) => (
        <Note key={i} kind="bad">
          {fmtFull(x.d)} · {motor.slot(x.s)?.etiqueta} · {motor.pessoa(x.u)?.nome} — {x.hard.join("; ")}
        </Note>
      ))}
    </Modal>
  );
}

function ModalLimpar({ motor, ws, G, onClose }: { motor: Motor; ws: string; G: string; onClose: () => void }) {
  const { aplicarTurnos } = useAcoes();
  const { toast } = useDialogo();
  const all: { data: string; pessoaId: string }[] = [];
  const auto: { data: string; pessoaId: string }[] = [];
  for (const d of dRange(ws, addDays(ws, 6)))
    for (const p of motor.membros(G)) {
      const e = motor.entradaDe(p.id, d);
      if (!e) continue;
      all.push({ data: d, pessoaId: p.id });
      if (e.origem !== "MANUAL") auto.push({ data: d, pessoaId: p.id });
    }
  const limpar = async (list: typeof all, txt: string) => {
    if (!list.length) return onClose();
    try {
      await aplicarTurnos({ retirar: list, registo: { acao: "Semana limpa", detalhe: `${motor.nomeGrupo(G)} · ${list.length} turnos${txt} · semana ${isoWeek(ws)}` } });
      toast(`${list.length} turnos retirados.`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  };
  return (
    <Modal
      open
      title="Limpar semana"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={() => limpar(auto, " automáticos")}>
            Limpar só sugestões/cópias ({auto.length})
          </Button>
          <Button variant="danger" size="sm" onClick={() => limpar(all, "")}>
            Limpar tudo ({all.length})
          </Button>
        </>
      }
    >
      <Note kind="warn">
        Semana de {fmt(ws)} · {motor.nomeGrupo(G)}: <b>{all.length}</b> turnos, dos quais <b>{auto.length}</b> vindos de sugestão, cópia, massa ou importação.
      </Note>
    </Modal>
  );
}

function ModalMassa({ motor, ws, G, onClose }: { motor: Motor; ws: string; G: string; onClose: () => void }) {
  const { aplicarTurnos } = useAcoes();
  const { toast } = useDialogo();
  const [sid, setSid] = useState(motor.slots[0]?.id ?? "");
  const [d1, setD1] = useState(ws);
  const [d2, setD2] = useState(addDays(ws, 6));
  const [dws, setDws] = useState<number[]>([0, 1, 2, 3, 4]);
  const [us, setUs] = useState<string[]>([]);
  const [skipW, setSkipW] = useState(true);
  const [aGravar, setAGravar] = useState(false);

  const rows = useMemo(() => {
    if (!d1 || !d2 || !sid) return [];
    const range = dRange(d1, d2, 400).filter((d) => dws.includes(dow(d)));
    const out: { u: string; d: string; kind: "ok" | "warn" | "bad"; msg: string; soft: Aviso[] }[] = [];
    for (const u of us)
      for (const d of range) {
        if (motor.turnoDe(u, d) === sid) continue;
        const r = motor.verificar(u, d, sid);
        out.push({
          u,
          d,
          kind: r.hard.length ? "bad" : r.soft.length ? "warn" : "ok",
          msg: r.hard.length ? r.hard.join("; ") : r.soft.map((w) => w.message).join("; "),
          soft: r.soft,
        });
      }
    return out;
  }, [motor, sid, d1, d2, dws, us]);

  async function confirmar() {
    const list = rows.filter((r) => r.kind === "ok" || (r.kind === "warn" && !skipW));
    if (!list.length) return onClose();
    setAGravar(true);
    try {
      const res = await aplicarTurnos({
        atribuir: list.map((r) => ({ data: r.d, slotId: sid, pessoaId: r.u, origem: "MASSA", justificacao: r.kind === "warn" ? "Atribuição em massa autorizada pela coordenação." : "" })),
        registo: { acao: "Atribuição em massa", detalhe: `${list.length} turnos · ${motor.slot(sid)?.etiqueta} · ${fmtDMY(d1)}–${fmtDMY(d2)}` },
      });
      toast(`${res.n} turnos atribuídos.`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof ErroApi && e.erros[0] ? `${e.erros[0].nome} ${fmt(e.erros[0].data)}: ${e.erros[0].motivo}` : e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }

  const nOk = rows.filter((r) => r.kind === "ok").length;
  const nW = rows.filter((r) => r.kind === "warn").length;
  const nB = rows.filter((r) => r.kind === "bad").length;
  return (
    <Modal
      open
      wide
      title="Atribuição em massa"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={aGravar || !rows.length} onClick={confirmar}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Slot">
          <select className={inputCls} value={sid} onChange={(e) => setSid(e.target.value)}>
            {motor.slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta} · {motor.periodos[s.periodo]}
                {s.piquete ? " · piquete" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input type="date" className={inputCls} value={d1} onChange={(e) => setD1(e.target.value)} />
        </Field>
        <Field label="Até">
          <input type="date" className={inputCls} value={d2} onChange={(e) => setD2(e.target.value)} />
        </Field>
      </div>
      <SecHead>Dias da semana</SecHead>
      <div className="flex flex-wrap gap-1.5">
        {DIAS.map((n, i) => (
          <Check key={n} label={n} checked={dws.includes(i)} onChange={(v) => setDws(v ? [...dws, i] : dws.filter((x) => x !== i))} />
        ))}
      </div>
      <SecHead>Pessoas · {motor.nomeGrupo(G)}</SecHead>
      <div className="flex flex-wrap gap-1.5">
        {motor.membros(G).map((p) => (
          <Check
            key={p.id}
            label={`${p.nome} (${p.periodos.join("")}${p.fazFds ? "+F" : ""})`}
            checked={us.includes(p.id)}
            onChange={(v) => setUs(v ? [...us, p.id] : us.filter((x) => x !== p.id))}
          />
        ))}
      </div>
      <div className="mt-3">
        <Check label="Excluir automaticamente os dias que geram aviso" checked={skipW} onChange={setSkipW} />
      </div>
      <SecHead>Pré-visualização</SecHead>
      {!rows.length ? (
        <Note>Selecione pessoas, slot e datas para ver a pré-visualização.</Note>
      ) : (
        <>
          <Note>
            <b>{nOk}</b> sem problema · <b>{nW}</b> com aviso · <b>{nB}</b> bloqueados (saltados).
          </Note>
          <Table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Pessoa</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">
                    {DIAS[dow(r.d)]} {fmt(r.d)}
                  </td>
                  <td className="whitespace-nowrap">{motor.pessoa(r.u)?.nome}</td>
                  <td className="text-xs">
                    {r.kind === "ok" ? <Tag kind="ok">ok</Tag> : r.kind === "warn" ? <><Tag kind="warn">aviso</Tag> {r.msg}</> : <><Tag kind="bad">bloqueado</Tag> {r.msg}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length > 60 && <p className="mt-2 text-xs text-slate-400">E mais {rows.length - 60} linhas.</p>}
        </>
      )}
    </Modal>
  );
}
