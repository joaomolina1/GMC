"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { addDays, DIAS, dow, dRange, fmt, fmtDMY, fmtFull, todayISO } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import { ESTADO_LABEL, TIPO_LABEL, type Ausencia, type Periodo, type TipoAusencia } from "@lib/escalas/tipos";
import { ok, sb, useAcoes, useMotor } from "../_lib/contexto";
import { FormAusencia, ListaAnexos, resumoDias } from "./Ausencias";
import { Button, Card, inputSm, Loading, Note, SecHead, Table, Tag, useDialogo } from "./ui";

export function Pedidos() {
  const hoje = todayISO();
  const { motor, loading, error } = useMotor(addDays(hoje, -63), addDays(hoje, 400), { todasAusencias: true });
  const [form, setForm] = useState<Partial<Ausencia> | null>(null);
  const [filtro, setFiltro] = useState<"" | TipoAusencia>("");
  const { registar, refrescar } = useAcoes();
  const { toast, confirmar, pedirTexto } = useDialogo();

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const todas = motor.ds.ausencias;
  const pend = todas.filter((a) => a.estado === "PENDENTE").sort((a, b) => a.inicio.localeCompare(b.inicio));
  const hist = todas.filter((a) => a.estado !== "PENDENTE").sort((a, b) => b.inicio.localeCompare(a.inicio));
  const nome = (id: string) => motor.pessoa(id)?.nome ?? motor.ds.pessoas.find((p) => p.id === id)?.nome ?? "—";

  async function decidir(a: Ausencia, estado: "APROVADA" | "REJEITADA", extra: { nota_decisao?: string; excecao?: string } = {}) {
    try {
      const conf = dRange(a.inicio, a.fim).filter((d) => motor!.turnoDe(a.pessoaId, d)).length;
      ok(await sb().from("escala_ausencias").update({ estado, ...extra }).eq("id", a.id));
      await registar(
        estado === "APROVADA" ? "Pedido aprovado" : "Pedido rejeitado",
        `${nome(a.pessoaId)} · ${TIPO_LABEL[a.tipo]} · ${fmtDMY(a.inicio)}–${fmtDMY(a.fim)}` +
          (estado === "APROVADA" && conf ? ` · ${conf} turno(s) retirado(s)` : "") +
          (extra.excecao ? ` · exceção: ${extra.excecao}` : "")
      );
      await refrescar();
      toast(estado === "APROVADA" ? "Pedido aprovado." : "Pedido rejeitado.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  async function aprovar(a: Ausencia) {
    const pc = motor!.conflitoAlternancia(a);
    if (!pc) return decidir(a, "APROVADA");
    const t = await pedirTexto({
      titulo: "Exceção à alternância",
      texto: <Note kind="bad">Viola a regra de alternância com <b>{pc.par.nome}</b>.</Note>,
      label: "Justificação da exceção",
      ok: "Aprovar com exceção",
    });
    if (t) decidir(a, "APROVADA", { excecao: t });
  }

  async function rejeitar(a: Ausencia) {
    const t = await pedirTexto({
      titulo: "Rejeitar pedido",
      label: "Nota para o trabalhador",
      placeholder: "Ex.: período crítico de cobertura; propõe-se a semana seguinte.",
      ok: "Rejeitar",
      obrigatorio: false,
    });
    if (t !== null) decidir(a, "REJEITADA", { nota_decisao: t });
  }

  async function apagar(a: Ausencia) {
    if (!(await confirmar({ titulo: "Apagar registo", texto: <>Apagar {TIPO_LABEL[a.tipo].toLowerCase()} de <b>{nome(a.pessoaId)}</b> ({fmtDMY(a.inicio)}–{fmtDMY(a.fim)})?</>, ok: "Apagar", perigo: true })))
      return;
    try {
      if (a.anexos.length) await sb().storage.from("escalas-comprovativos").remove(a.anexos.map((x) => x.caminho));
      ok(await sb().from("escala_ausencias").delete().eq("id", a.id));
      await registar("Ausência apagada", `${nome(a.pessoaId)} · ${fmtDMY(a.inicio)}–${fmtDMY(a.fim)}`);
      await refrescar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  return (
    <>
      <Card
        title="Pedidos pendentes"
        sub={`${pend.length} a aguardar decisão`}
        actions={
          <Button size="sm" variant="outline" onClick={() => setForm({})}>
            <Plus size={14} /> Registar ausência ou folga
          </Button>
        }
      >
        {!pend.length && <Note kind="ok">Sem pedidos pendentes.</Note>}
        {pend.map((a) => (
          <PedidoPendente key={a.id} motor={motor} a={a} onAprovar={() => aprovar(a)} onRejeitar={() => rejeitar(a)} />
        ))}
      </Card>

      <Card
        title="Decididos e registados"
        sub={`${hist.length} registo(s)`}
        actions={
          <select className={inputSm} value={filtro} onChange={(e) => setFiltro(e.target.value as "" | TipoAusencia)}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        }
        bodyClass="p-0"
      >
        <Table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Tipo</th>
              <th>Período</th>
              <th>Estado</th>
              <th>Justificação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hist
              .filter((a) => !filtro || a.tipo === filtro)
              .slice(0, 300)
              .map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{nome(a.pessoaId)}</td>
                  <td className="whitespace-nowrap">{TIPO_LABEL[a.tipo]}</td>
                  <td className="whitespace-nowrap">
                    {fmtDMY(a.inicio)} – {fmtDMY(a.fim)}
                  </td>
                  <td>
                    <Tag kind={a.estado === "APROVADA" ? "ok" : a.estado === "CANCELADA" ? "info" : "bad"}>{ESTADO_LABEL[a.estado]}</Tag>
                  </td>
                  <td className="text-slate-600">
                    <ListaAnexos anexos={a.anexos} />
                    {a.justificacao}
                    {a.notaDecisao && <div className="text-xs text-slate-500">Nota: {a.notaDecisao}</div>}
                    {a.excecao && <Tag kind="warn">exceção: {a.excecao}</Tag>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setForm(a)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => apagar(a)}>
                      Apagar
                    </Button>
                  </td>
                </tr>
              ))}
            {!hist.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  Ainda não há pedidos decididos nem ausências registadas.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      {form && <FormAusencia motor={motor} inicial={form} onClose={() => setForm(null)} />}
    </>
  );
}

function PedidoPendente({ motor, a, onAprovar, onRejeitar }: { motor: Motor; a: Ausencia; onAprovar: () => void; onRejeitar: () => void }) {
  const p = motor.pessoa(a.pessoaId);
  if (!p) return null;
  const dias = dRange(a.inicio, a.fim);
  const conf = dias.filter((d) => motor.turnoDe(a.pessoaId, d));
  const pc = motor.conflitoAlternancia(a);
  const gs = [p.grupoId, p.integraGrupoId].filter(Boolean) as string[];
  const risco = dias.filter((d) =>
    gs.some((g) => {
      const x = motor.verificarPeriodo(g, d);
      const s = motor.turnoDe(a.pessoaId, d);
      if (!x || x.na || !s) return false;
      const per = motor.slot(s)!.periodo as Periodo;
      return (x.m[per] ?? 0) > 0 && x.c[per] - 1 < (x.m[per] ?? 0);
    })
  );
  const ano = a.inicio.slice(0, 4);
  const usadas = motor.feriasUsadas(a.pessoaId, ano);
  const saldo = motor.feriasSaldo(a.pessoaId, ano);
  const pedidas = dias.filter((d) => d.startsWith(ano) && motor.diaUtil(d)).length;

  return (
    <div className="mb-4 rounded-xl border border-line">
      <div className="border-b border-line px-4 py-3">
        <div className="font-semibold text-slate-900">
          {p.nome} · {TIPO_LABEL[a.tipo]}
        </div>
        <div className="text-xs text-slate-500">
          {fmtFull(a.inicio)} → {fmtFull(a.fim)} · {resumoDias(motor, a)} · {motor.nomeGrupo(p.grupoId)}
        </div>
      </div>
      <div className="px-4 py-3">
        {a.tipo === "BAIXA" &&
          (a.anexos.length ? (
            <div className="mb-2">
              <ListaAnexos anexos={a.anexos} />
            </div>
          ) : (
            <Note kind="bad">
              <b>Sem comprovativo anexado.</b>
            </Note>
          ))}
        <Note>
          <b>{a.tipo === "BAIXA" ? "Observações" : "Justificação"}:</b> {a.justificacao || "—"}
        </Note>
        {a.tipo === "FERIAS" && (
          <Note kind={usadas + pedidas > saldo ? "warn" : undefined}>
            Férias {ano}: {usadas} dia(s) útil(eis) já aprovados de {saldo}. Com este pedido: {usadas + pedidas}.
          </Note>
        )}
        {pc && (
          <Note kind="bad">
            <b>Alternância:</b> {p.nome} alterna com {pc.par.nome}, que já tem {TIPO_LABEL[pc.abs.tipo].toLowerCase()} aprovada sobreposta ({fmt(pc.abs.inicio)}–{fmt(pc.abs.fim)}). A regra proíbe folgas ou férias em simultâneo.
          </Note>
        )}
        {risco.length > 0 && (
          <Note kind="warn">
            <b>Mínimo por período em risco</b> em {risco.map(fmt).join(", ")}: cairia abaixo do mínimo se aprovado sem substituição.
          </Note>
        )}
        <SecHead>Disponibilidade do grupo nesses dias</SecHead>
        <ul className="mb-3 space-y-0.5 text-[13px] text-slate-600">
          {dias.slice(0, 14).map((d) => {
            const meu = motor.turnoDe(a.pessoaId, d);
            return (
              <li key={d}>
                {DIAS[dow(d)]} {fmt(d)}
                {meu && <b> (tem {motor.slot(meu)?.etiqueta})</b>} —{" "}
                {p.periodos
                  .map((pe) => {
                    const livres = new Set<string>();
                    for (const s of motor.slots.filter((s) => s.periodo === pe))
                      for (const x of motor.disponiveis(d, s.id, p.grupoId)) if (x.id !== p.id) livres.add(x.id);
                    return `${motor.periodos[pe]}: ${livres.size} livre(s)`;
                  })
                  .join(" · ")}
              </li>
            );
          })}
          {dias.length > 14 && <li className="text-slate-400">…</li>}
        </ul>
        {conf.length > 0 && (
          <Note kind="bad">
            <b>{conf.length} turno(s) em conflito</b> serão retirados ao aprovar: {conf.map((d) => `${fmt(d)} ${motor.slot(motor.turnoDe(a.pessoaId, d)!)?.etiqueta}`).join(", ")}.
          </Note>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onAprovar}>
            {pc ? "Aprovar com exceção" : "Aprovar"}
          </Button>
          <Button size="sm" variant="outline" onClick={onRejeitar}>
            Rejeitar
          </Button>
        </div>
      </div>
    </div>
  );
}
