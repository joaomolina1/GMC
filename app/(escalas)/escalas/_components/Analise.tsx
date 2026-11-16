"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { addDays, DIAS, dow, fmt, fmtDMY, fmtFull, lastDayOfMonth, mondayOf, todayISO } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import type { Pessoa } from "@lib/escalas/tipos";
import { cn } from "@lib/utils";
import { useMotor } from "../_lib/contexto";
import { FormAusencia } from "./Ausencias";
import { exportarExcel } from "./excel";
import { Button, Card, inputSm, Loading, Modal, Note, Table, Tag, useDialogo } from "./ui";

function useIntervalo() {
  const ws = mondayOf(todayISO());
  const [r, setR] = useState<[string, string]>([addDays(ws, -21), addDays(ws, 6)]);
  return [r, setR] as const;
}

function BarraIntervalo({ r, setR }: { r: [string, string]; setR: (v: [string, string]) => void }) {
  const ws = mondayOf(todayISO());
  const t = todayISO();
  const presets: [string, () => [string, string]][] = [
    ["4 semanas", () => [addDays(ws, -21), addDays(ws, 6)]],
    ["8 semanas", () => [addDays(ws, -49), addDays(ws, 6)]],
    ["Este mês", () => [t.slice(0, 8) + "01", lastDayOfMonth(t)]],
    ["Este ano", () => [t.slice(0, 4) + "-01-01", t.slice(0, 4) + "-12-31"]],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">De</span>
      <input type="date" className={inputSm} value={r[0]} onChange={(e) => e.target.value && e.target.value <= r[1] && setR([e.target.value, r[1]])} />
      <span className="text-xs text-slate-500">até</span>
      <input type="date" className={inputSm} value={r[1]} onChange={(e) => e.target.value && e.target.value >= r[0] && setR([r[0], e.target.value])} />
      {presets.map(([n, f]) => (
        <Button key={n} size="sm" variant="outline" onClick={() => setR(f())}>
          {n}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- conformidade
export function Conformidade() {
  const [r, setR] = useIntervalo();
  const [from, to] = r;
  const { motor, loading, error } = useMotor(addDays(from, -70), addDays(to, 21));
  const [saldo, setSaldo] = useState<Pessoa | null>(null);
  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const st = motor.regras;

  return (
    <>
      <Card
        title="Conformidade e rotação"
        sub={`Máx. ${st.maxDiasConsecutivos} dias seguidos · mín. ${st.folgasMinimas} folgas em ${st.janelaFolgas} dias · clique numa linha para ver o saldo de folgas`}
        actions={<BarraIntervalo r={r} setR={setR} />}
        bodyClass="p-0"
      >
        <Table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Grupo</th>
              <th className="text-right">Turnos</th>
              <th className="text-right">Horas</th>
              <th className="text-right">FDS</th>
              <th className="text-right">Piquetes</th>
              <th className="text-right">Máx. seguidos</th>
              <th className="text-right">Pior janela</th>
              <th className="text-right">Compensação</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {motor.pessoas.map((p) => {
              const s = motor.estatPessoa(p.id, from, to);
              const lg = motor.saldoCompensacao(p.id, from, to);
              let pior = 99;
              for (let d = from; d <= to; d = addDays(d, 7)) pior = Math.min(pior, motor.folgasPior(p.id, d).livres);
              pior = Math.min(pior, motor.folgasPior(p.id, to).livres);
              const probs: string[] = [];
              if (s.maxRun > st.maxDiasConsecutivos) probs.push(`${s.maxRun} dias seguidos`);
              if (pior < st.folgasMinimas) probs.push(`${pior} folgas/${st.janelaFolgas}d`);
              if (lg.falta > 0) probs.push(`${lg.falta} folga(s) de compensação em falta`);
              if (s.exc) probs.push(`${s.exc} exceção(ões)`);
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSaldo(p)}>
                  <td className="whitespace-nowrap font-medium">{p.nome}</td>
                  <td>
                    <Tag>{motor.nomeGrupo(p.grupoId)}</Tag>
                  </td>
                  <td className="text-right tabular-nums">{s.t}</td>
                  <td className="text-right tabular-nums">{s.h}h</td>
                  <td className="text-right tabular-nums">{s.fds}</td>
                  <td className="text-right tabular-nums">{s.piq}</td>
                  <td className="text-right tabular-nums">{s.maxRun}</td>
                  <td className="text-right tabular-nums">{pior === 99 ? "–" : pior}</td>
                  <td className="text-right tabular-nums">{lg.dev ? `${lg.got}/${lg.dev}` : "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">{probs.length ? probs.map((x) => <Tag key={x} kind="warn">{x}</Tag>) : <Tag kind="ok">conforme</Tag>}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="Rotação justa" sub="Amplitude entre quem tem mais e quem tem menos, por grupo, no período">
        {motor.grupos.map((g) => {
          const m = motor.membros(g.id);
          if (!m.length) return null;
          const sts = m.map((p) => motor.estatPessoa(p.id, from, to));
          const rng = (k: "fds" | "piq" | "t") => [Math.min(...sts.map((x) => x[k])), Math.max(...sts.map((x) => x[k]))];
          const [f0, f1] = rng("fds");
          const [p0, p1] = rng("piq");
          const [t0, t1] = rng("t");
          const eleg = m.filter((p) => motor.slots.some((s) => s.piquete && p.periodos.includes(s.periodo))).length;
          return (
            <Note key={g.id} kind={f1 - f0 <= 1 && p1 - p0 <= 1 ? "ok" : "warn"}>
              <b>{g.nome}</b> — turnos {t0}–{t1} · fins de semana {f0}–{f1} (amplitude {f1 - f0}) · piquetes {p0}–{p1} (amplitude {p1 - p0}
              {eleg < m.length ? `, só ${eleg} pessoa(s) com noite no perfil` : ""}).
            </Note>
          );
        })}
      </Card>

      <Alternancias motor={motor} from={from} to={to} />
      {saldo && <ModalSaldo motor={motor} p={saldo} from={from} to={to} onClose={() => setSaldo(null)} />}
    </>
  );
}

function Alternancias({ motor, from, to }: { motor: Motor; from: string; to: string }) {
  const pares = motor.paresAlternancia();
  const v = motor.violacoesAlternancia(from, to);
  return (
    <Card title="Alternâncias" sub={`${pares.length} par(es) configurado(s)`}>
      {!pares.length ? (
        <Note>Sem pares de alternância. Configure em Pessoas → “Alterna com”.</Note>
      ) : !v.length ? (
        <Note kind="ok">Nenhum dia com as duas pessoas do par sem turno.</Note>
      ) : (
        v.slice(0, 40).map((x, i) => (
          <Note key={i} kind="warn">
            {fmtFull(x.d)} — {motor.pessoa(x.a)?.nome} e {motor.pessoa(x.b)?.nome} sem turno no mesmo dia.
          </Note>
        ))
      )}
    </Card>
  );
}

function ModalSaldo({ motor, p, from, to, onClose }: { motor: Motor; p: Pessoa; from: string; to: string; onClose: () => void }) {
  const lg = motor.saldoCompensacao(p.id, from, to);
  const [form, setForm] = useState(false);
  if (form)
    return (
      <FormAusencia
        motor={motor}
        inicial={{ pessoaId: p.id, tipo: "FOLGA", inicio: todayISO(), fim: todayISO(), justificacao: "Compensação", estado: "APROVADA" }}
        onClose={onClose}
      />
    );
  return (
    <Modal
      open
      title="Saldo de folgas de compensação"
      onClose={onClose}
      footer={
        <>
          {lg.falta > 0 && (
            <Button size="sm" variant="outline" onClick={() => setForm(true)}>
              Registar folga de compensação
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <Note kind={lg.falta > 0 ? "warn" : "ok"}>
        <b>{p.nome}</b> — {lg.dev} folga(s) de compensação devida(s) entre {fmtDMY(from)} e {fmtDMY(to)}; {lg.got} coberta(s) por dias livres na janela; <b>{lg.falta}</b> em falta.
      </Note>
      <p className="mb-3 text-xs text-slate-500">
        Cada fim de semana trabalhado procura folgas nos dias úteis dessa semana e da seguinte; cada bloco de piquete procura-as nos 7 dias antes e depois. Um dia livre só serve uma obrigação.
      </p>
      {lg.obl.length ? (
        <Table>
          <thead>
            <tr>
              <th>Origem</th>
              <th className="text-right">Devidas</th>
              <th>Dias livres usados</th>
              <th className="text-right">Falta</th>
            </tr>
          </thead>
          <tbody>
            {lg.obl.map((o, i) => (
              <tr key={i}>
                <td>{o.label}</td>
                <td className="text-right">{o.need}</td>
                <td>{o.dias.map((d) => `${DIAS[dow(d)]} ${fmt(d)}`).join(", ") || "—"}</td>
                <td className={cn("text-right", o.need - o.dias.length > 0 && "font-semibold text-red-600")}>{o.need - o.dias.length}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Note>Sem fins de semana nem blocos de piquete no período.</Note>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- relatórios
export function Relatorios() {
  const [r, setR] = useIntervalo();
  const [from, to] = r;
  const { motor, loading, error } = useMotor(addDays(from, -70), addDays(to, 21));
  const { toast } = useDialogo();
  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const cols = ["t", "h", "M", "T", "N", "piq", "fds", "abs", "exc"] as const;
  return (
    <Card
      title="Horas e turnos por pessoa"
      actions={
        <>
          <BarraIntervalo r={r} setR={setR} />
          <Button size="sm" onClick={() => exportarExcel(motor, from, to).catch((e) => toast(e.message, "bad"))}>
            <FileDown size={14} /> Exportar para Excel
          </Button>
        </>
      }
      bodyClass="p-0"
    >
      <Table>
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Grupo</th>
            <th className="text-right">Turnos</th>
            <th className="text-right">Horas</th>
            <th className="text-right">{motor.periodos.M}</th>
            <th className="text-right">{motor.periodos.T}</th>
            <th className="text-right">{motor.periodos.N}</th>
            <th className="text-right">Piquetes</th>
            <th className="text-right">FDS</th>
            <th className="text-right">Dias ausente</th>
            <th className="text-right">Exceções</th>
          </tr>
        </thead>
        <tbody>
          {motor.grupos.map((g) => {
            const m = motor.membros(g.id);
            if (!m.length) return null;
            const acc = { t: 0, h: 0, M: 0, T: 0, N: 0, piq: 0, fds: 0, abs: 0, exc: 0 };
            const rows = m.map((p) => {
              const s = motor.estatPessoa(p.id, from, to);
              for (const k of cols) acc[k] += s[k];
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.nome}</td>
                  <td className="whitespace-nowrap">{g.nome}</td>
                  {cols.map((k) => (
                    <td key={k} className="text-right tabular-nums">
                      {s[k]}
                    </td>
                  ))}
                </tr>
              );
            });
            acc.h = Math.round(acc.h * 10) / 10;
            return [
              ...rows,
              <tr key={`${g.id}-total`} className="bg-slate-50 font-semibold">
                <td colSpan={2}>Total {g.nome}</td>
                {cols.map((k) => (
                  <td key={k} className="text-right tabular-nums">
                    {acc[k]}
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </Table>
    </Card>
  );
}
