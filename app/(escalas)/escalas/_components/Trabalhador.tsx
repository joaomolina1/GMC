"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, DIAS, dRange, fmt, fmtDMY, fmtFull, mondayOf, todayISO } from "@lib/escalas/datas";
import { ESTADO_LABEL, TIPO_LABEL, type Ausencia, type TipoAusencia } from "@lib/escalas/tipos";
import { cn } from "@lib/utils";
import { ok, sb, useAcoes, useMotor, useSessao } from "../_lib/contexto";
import { CampoAnexo, enviarAnexo, ListaAnexos, periodoTxt } from "./Ausencias";
import { Av, Button, Card, Field, inputCls, Kpi, Kpis, Loading, Note, Table, Tag, useDialogo } from "./ui";

/** Par de alternância do próprio (sem expor as ausências do par). */
function useAlternancia(inicio?: string, fim?: string) {
  return useQuery({
    queryKey: ["escalas", "alternancia", inicio ?? null, fim ?? null],
    queryFn: async () => {
      const { data } = await sb().rpc("escala_minha_alternancia", { p_inicio: inicio ?? null, p_fim: fim ?? null });
      const r = (data as { par_nome: string; par_ausente: boolean }[] | null)?.[0];
      return r ? { nome: r.par_nome, ausente: r.par_ausente } : null;
    },
  });
}

// ---------------------------------------------------------------- a minha escala
export function Minha() {
  const sessao = useSessao();
  const hoje = todayISO();
  const wsNow = mondayOf(hoje);
  const [ws, setWs] = useState(wsNow);
  const lo = ws < wsNow ? ws : wsNow;
  const hi = ws > wsNow ? ws : wsNow;
  const { motor, loading, error } = useMotor(addDays(lo, -63), addDays(hi, 50));
  const { data: alt } = useAlternancia();
  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const u = sessao.pessoaId!;
  const p = motor.pessoa(u);
  if (!p) return <Note>A sua sessão não está associada a nenhuma pessoa ativa da escala.</Note>;
  const ano = hoje.slice(0, 4);
  const prox = motor.proximosTurnos(u, hoje, 8);
  const hs = motor.horasSemana(u, hoje);
  const usadas = motor.feriasUsadas(u, ano);
  const saldo = motor.feriasSaldo(u, ano);
  const lg = motor.saldoCompensacao(u, addDays(wsNow, -56), addDays(wsNow, 13));
  const pend = motor.ds.ausencias.filter((a) => a.estado === "PENDENTE").length;

  return (
    <>
      <div className="mb-1 text-2xl font-semibold text-slate-900">Olá, {p.nome.split(/\s+/)[0]}</div>
      <div className="mb-5 text-sm text-slate-500">
        {motor.nomeGrupo(p.grupoId)} · {motor.prefTxt(p)}
      </div>
      <Kpis>
        <Kpi
          label="Próximo turno"
          value={prox.length ? motor.slot(prox[0].s)?.etiqueta : "—"}
          sub={prox.length ? fmtFull(prox[0].d) + (motor.slot(prox[0].s)?.piquete ? " · piquete" : "") : "sem turnos marcados"}
        />
        <Kpi label="Esta semana" value={`${hs}h`} sub={`${dRange(wsNow, addDays(wsNow, 6)).filter((d) => motor.turnoDe(u, d)).length} turno(s)`} />
        <Kpi label={`Férias ${ano}`} value={`${usadas}/${saldo}`} sub={`${Math.max(saldo - usadas, 0)} dia(s) útil(eis) disponíveis`} frac={saldo ? usadas / saldo : 0} />
        <Kpi
          label="Folgas de compensação"
          value={lg.falta > 0 ? lg.falta : 0}
          sub={lg.dev ? `em falta · ${lg.got}/${lg.dev} cobertas (8 sem.)` : pend ? `${pend} pedido(s) pendente(s)` : "nada devido nas últimas 8 semanas"}
        />
      </Kpis>

      <Card
        title="A minha escala"
        sub={`${p.nome} · ${motor.nomeGrupo(p.grupoId)}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWs(addDays(ws, -7))} aria-label="Semana anterior">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWs(wsNow)}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWs(addDays(ws, 7))} aria-label="Semana seguinte">
              <ChevronRight size={16} />
            </Button>
          </>
        }
      >
        <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {DIAS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((w) => (
          <div key={w} className="mb-1.5 grid grid-cols-7 gap-1.5">
            {dRange(addDays(ws, w * 7), addDays(ws, w * 7 + 6)).map((d) => {
              const s = motor.turnoDe(u, d);
              const sl = s ? motor.slot(s) : undefined;
              const ab = motor.ausenciaEm(u, d, "APROVADA");
              const pd = motor.ausenciaEm(u, d, "PENDENTE");
              const fer = motor.feriado(d);
              return (
                <div
                  key={d}
                  title={fer?.nome}
                  className={cn(
                    "min-h-[64px] rounded-lg border p-1.5 text-[11px] sm:p-2",
                    sl ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-slate-50",
                    ab?.tipo === "FERIAS" && "border-amber-200 bg-amber-50",
                    ab?.tipo === "FOLGA" && "border-emerald-200 bg-emerald-50",
                    ab && ab.tipo !== "FERIAS" && ab.tipo !== "FOLGA" && "border-red-200 bg-red-50",
                    d === hoje && "ring-2 ring-brand-400"
                  )}
                >
                  <b className={cn("block", fer ? "text-rose-600" : "text-slate-700")}>{fmt(d)}</b>
                  {sl ? (
                    <>
                      <span className="block text-[13px] font-semibold text-brand-800">{sl.etiqueta}</span>
                      <span className="text-slate-500">{sl.piquete ? "piquete" : motor.periodos[sl.periodo]}</span>
                    </>
                  ) : ab ? (
                    <span className="text-slate-600">{TIPO_LABEL[ab.tipo]}</span>
                  ) : pd ? (
                    <span className="text-amber-700">pedido pendente</span>
                  ) : (
                    <span className="text-slate-400">{fer ? "feriado" : "folga"}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <p className="mt-2 text-xs text-slate-500">Azul = turno · amarelo = férias · vermelho = indisponibilidade ou baixa · verde = folga de compensação · cinzento = sem turno.</p>
        {alt && (
          <Note kind="warn" className="mt-3">
            Alterna com <b>{alt.nome}</b>: não podem folgar nem gozar férias no mesmo dia.
          </Note>
        )}
      </Card>

      {prox.length > 0 && (
        <Card title="Próximos turnos" bodyClass="p-0">
          <Table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Horário</th>
                <th>Período</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {prox.map((x) => {
                const e = motor.entradaDe(u, x.d);
                const sl = motor.slot(x.s)!;
                return (
                  <tr key={x.d}>
                    <td className="whitespace-nowrap">{fmtFull(x.d)}</td>
                    <td className="whitespace-nowrap font-semibold">{sl.etiqueta}</td>
                    <td className="whitespace-nowrap">
                      {motor.periodos[sl.periodo]}
                      {sl.piquete ? " · piquete" : ""}
                    </td>
                    <td>{e?.excecao ? <><Tag kind="warn">exceção</Tag> {e.justificacao}</> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- pedir ausência
export function Pedir() {
  const sessao = useSessao();
  const router = useRouter();
  const hoje = todayISO();
  const { motor, loading, error } = useMotor(addDays(hoje, -60), addDays(hoje, 400));
  const { registar, refrescar } = useAcoes();
  const { toast } = useDialogo();
  const [tipo, setTipo] = useState<TipoAusencia>("INDISPONIBILIDADE");
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [just, setJust] = useState("");
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erroAnexo, setErroAnexo] = useState(false);
  const [erroJust, setErroJust] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const fim = ate < de ? de : ate;
  const { data: alt } = useAlternancia(de, fim);
  useEffect(() => setErroAnexo(false), [ficheiro]);

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const u = sessao.pessoaId!;
  const p = motor.pessoa(u);
  if (!p) return <Note>A sua sessão não está associada a nenhuma pessoa ativa da escala.</Note>;
  const baixa = tipo === "BAIXA";
  const dias = de ? dRange(de, fim) : [];
  const uteis = motor.diasUteis(dias);
  const conf = dias.filter((d) => motor.turnoDe(u, d));
  const ano = de.slice(0, 4);

  async function submeter() {
    if (baixa && !ficheiro) {
      setErroAnexo(true);
      return toast("Anexe o comprovativo da baixa.", "bad");
    }
    if (!baixa && !just.trim()) {
      setErroJust(true);
      return;
    }
    setAGravar(true);
    try {
      const r = ok(
        await sb().from("escala_ausencias").insert({ pessoa_id: u, tipo, inicio: de, fim, estado: "PENDENTE", justificacao: just.trim() }).select("id").single()
      ) as { id: string };
      if (ficheiro) {
        try {
          await enviarAnexo(u, r.id, ficheiro);
        } catch (e) {
          toast(`O pedido foi submetido, mas o comprovativo não: ${e instanceof Error ? e.message : ""}`, "bad");
        }
      }
      await registar("Pedido submetido", `${p!.nome} · ${TIPO_LABEL[tipo]} · ${fmtDMY(de)}–${fmtDMY(fim)}${ficheiro ? ` · anexo: ${ficheiro.name}` : ""}`);
      await refrescar();
      toast("Pedido submetido.", "ok");
      router.push("/escalas/meus-pedidos");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Card title="Novo pedido" sub={`${p.nome} · sujeito a aprovação da coordenação`} className="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo">
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAusencia)}>
            <option value="INDISPONIBILIDADE">Indisponibilidade</option>
            <option value="BAIXA">Baixa médica</option>
            <option value="FERIAS">Férias</option>
          </select>
        </Field>
        <Field label="De">
          <input type="date" className={inputCls} value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
        </Field>
        <Field label="Até">
          <input type="date" className={inputCls} value={fim} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} />
        </Field>
      </div>
      {baixa && (
        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Comprovativo de baixa (obrigatório)</span>
          <CampoAnexo ficheiro={ficheiro} onChange={setFicheiro} erro={erroAnexo} />
        </div>
      )}
      <Field label={baixa ? "Observações (opcional)" : "Justificação (obrigatória)"} className="mt-4">
        <textarea
          rows={3}
          className={cn(inputCls, erroJust && "border-red-400")}
          placeholder={baixa ? "Ex.: data prevista de regresso." : "Descreva o motivo. A coordenação vê este texto ao decidir."}
          value={just}
          onChange={(e) => {
            setJust(e.target.value);
            setErroJust(false);
          }}
        />
      </Field>
      <div className="mt-4">
        <Note>
          <b>{dias.length}</b> dia(s) · <b>{uteis}</b> útil(eis).
        </Note>
        {baixa && de < hoje && <Note>A baixa pode começar numa data passada.</Note>}
        {tipo === "FERIAS" && (
          <Note kind={motor.feriasUsadas(u, ano) + uteis > motor.feriasSaldo(u, ano) ? "warn" : undefined}>
            Férias {ano}: {motor.feriasUsadas(u, ano)} de {motor.feriasSaldo(u, ano)} já aprovados. Ficaria com {motor.feriasSaldo(u, ano) - motor.feriasUsadas(u, ano) - uteis}.
          </Note>
        )}
        {conf.length > 0 && (
          <Note kind="warn">
            Já tem turnos em {conf.length} destes dias ({conf.map((d) => `${fmt(d)} ${motor.slot(motor.turnoDe(u, d)!)?.etiqueta}`).join(", ")}). Serão retirados se o pedido for aprovado.
          </Note>
        )}
        {!baixa && alt?.ausente && (
          <Note kind="warn">A pessoa com quem alterna já tem uma ausência prevista neste período. Não podem estar fora ao mesmo tempo, por isso o pedido pode ser recusado.</Note>
        )}
      </div>
      <Button className="mt-2" disabled={aGravar} onClick={submeter}>
        {aGravar ? "A submeter…" : "Submeter pedido"}
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------- os meus pedidos
export function MeusPedidos() {
  const sessao = useSessao();
  const hoje = todayISO();
  const { motor, loading, error } = useMotor(hoje, hoje, { todasAusencias: true });
  const { registar, refrescar } = useAcoes();
  const { toast, confirmar } = useDialogo();
  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const u = sessao.pessoaId!;
  const mine = motor.ds.ausencias.filter((a) => a.pessoaId === u).sort((a, b) => b.inicio.localeCompare(a.inicio));

  async function cancelar(a: Ausencia) {
    if (!(await confirmar({ titulo: "Cancelar pedido", texto: "Cancelar este pedido pendente?", ok: "Cancelar pedido", perigo: true }))) return;
    try {
      ok(await sb().from("escala_ausencias").update({ estado: "CANCELADA" }).eq("id", a.id));
      await registar("Pedido cancelado", `${motor!.pessoa(u)?.nome} · ${fmtDMY(a.inicio)}–${fmtDMY(a.fim)}`);
      await refrescar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  return (
    <Card title="Os meus pedidos" sub={`${mine.length} no total`}>
      {!mine.length && <Note>Ainda não há pedidos.</Note>}
      {mine.map((a) => (
        <div key={a.id} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
          <Av nome={a.tipo === "FERIAS" ? "F" : a.tipo === "FOLGA" ? "C" : a.tipo === "BAIXA" ? "B" : "I"} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900">
              {TIPO_LABEL[a.tipo]} · {periodoTxt(a)}
            </div>
            <ListaAnexos anexos={a.anexos} />
            {a.justificacao && <div className="text-xs text-slate-500">{a.justificacao}</div>}
            {a.notaDecisao && <div className="text-xs text-red-700">Nota da coordenação: {a.notaDecisao}</div>}
            {a.excecao && <div className="text-xs text-amber-700">Aprovado com exceção: {a.excecao}</div>}
          </div>
          <Tag kind={a.estado === "APROVADA" ? "ok" : a.estado === "REJEITADA" ? "bad" : a.estado === "CANCELADA" ? "info" : "warn"}>{ESTADO_LABEL[a.estado]}</Tag>
          {a.estado === "PENDENTE" && (
            <Button size="sm" variant="outline" onClick={() => cancelar(a)}>
              Cancelar
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
