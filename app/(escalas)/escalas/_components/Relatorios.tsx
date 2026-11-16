"use client";

import { useMemo, useState } from "react";
import { BarChart3, FileDown, Table2 } from "lucide-react";
import { addDays, daysBetween, fmtDMY } from "@lib/escalas/datas";
import type { EstatPessoa, Motor } from "@lib/escalas/motor";
import type { Periodo, Pessoa } from "@lib/escalas/tipos";
import { cn } from "@lib/utils";
import { useMotor } from "../_lib/contexto";
import { BarraIntervalo, useIntervalo } from "./Analise";
import { exportarExcel } from "./excel";
import { Av, Button, Card, Loading, Note, Table, useDialogo } from "./ui";

/** Categóricas (slots 1–3 da paleta de referência; validadas para todos os pares). */
const COR: Record<Periodo, string> = { M: "#2a78d6", T: "#eb6834", N: "#1baf7a" };
const COLS = ["t", "h", "M", "T", "N", "piq", "fds", "abs", "exc"] as const;

type Linha = { p: Pessoa; s: EstatPessoa };

export function Relatorios() {
  const [r, setR] = useIntervalo();
  const [from, to] = r;
  const { motor, loading, error } = useMotor(addDays(from, -70), addDays(to, 21));
  const { toast } = useDialogo();
  const [grupo, setGrupo] = useState<string>("");
  const [vista, setVista] = useState<"grafico" | "tabela">("grafico");

  const dados = useMemo(() => {
    if (!motor) return null;
    const porGrupo = motor.grupos
      .map((g) => ({ g, linhas: motor.membros(g.id).map((p): Linha => ({ p, s: motor.estatPessoa(p.id, from, to) })) }))
      .filter((x) => x.linhas.length);
    return porGrupo;
  }, [motor, from, to]);

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor || !dados) return <Loading />;

  const visiveis = dados.filter((x) => !grupo || x.g.id === grupo);
  const todas = visiveis.flatMap((x) => x.linhas);
  const tot = soma(todas);
  const dias = daysBetween(from, to) + 1;
  const limite = Math.round(motor.regras.maxHorasSemanais * (dias / 7) * 10) / 10;
  const escala = Math.max(limite, ...todas.map((l) => l.s.h), 1);

  return (
    <>
      <Card
        title="Horas e turnos"
        sub={`${fmtDMY(from)} a ${fmtDMY(to)} · ${dias} dias · limite de referência ${limite}h por pessoa (${motor.regras.maxHorasSemanais}h/semana)`}
        actions={
          <Button size="sm" onClick={() => exportarExcel(motor, from, to).catch((e) => toast(e.message, "bad"))}>
            <FileDown size={14} /> Exportar para Excel
          </Button>
        }
        toolbar={<BarraIntervalo r={r} setR={setR} />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Total label="Turnos" valor={tot.t} />
          <Total label="Horas" valor={`${tot.h}h`} sub={todas.length ? `média ${Math.round((tot.h / todas.length) * 10) / 10}h por pessoa` : undefined} />
          <Total label="Piquetes" valor={tot.piq} />
          <Total label="Fins de semana" valor={tot.fds} sub="pessoa × fim de semana" />
          <Total label="Dias de ausência" valor={tot.abs} />
          <Total label="Exceções" valor={tot.exc} destaque={tot.exc > 0} />
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ id: "", nome: "Todos os grupos" }, ...motor.grupos].map((g) => (
          <button
            key={g.id || "todos"}
            type="button"
            onClick={() => setGrupo(g.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              grupo === g.id ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            {g.nome}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(
            [
              ["grafico", "Gráfico", BarChart3],
              ["tabela", "Tabela", Table2],
            ] as const
          ).map(([k, l, I]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", vista === k ? "bg-brand-50 font-medium text-brand-700" : "text-slate-500 hover:text-slate-800")}
            >
              <I size={14} /> {l}
            </button>
          ))}
        </div>
      </div>

      {vista === "tabela" ? (
        <Tabela motor={motor} grupos={visiveis} />
      ) : (
        visiveis.map(({ g, linhas }) => {
          const t = soma(linhas);
          const ordenadas = [...linhas].sort((a, b) => b.s.h - a.s.h || a.p.nome.localeCompare(b.p.nome, "pt"));
          return (
            <Card
              key={g.id}
              title={g.nome}
              sub={`${linhas.length} pessoa(s) · ${t.t} turnos · ${t.h}h · ${t.piq} piquetes · ${t.fds} fins de semana`}
              actions={<Legenda motor={motor} />}
              bodyClass="px-5 py-2"
            >
              <div className="hidden grid-cols-[minmax(150px,220px)_1fr_minmax(140px,200px)_200px] gap-4 border-b border-line pb-2 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 md:grid">
                <span>Pessoa</span>
                <span>Horas</span>
                <span>Turnos por período</span>
                <span>Outros</span>
              </div>
              {ordenadas.map(({ p, s }) => (
                <LinhaPessoa key={p.id} motor={motor} p={p} s={s} escala={escala} limite={limite} idx={motor.grupos.findIndex((x) => x.id === g.id)} />
              ))}
            </Card>
          );
        })
      )}
    </>
  );
}

function soma(linhas: Linha[]) {
  const acc = { t: 0, h: 0, M: 0, T: 0, N: 0, piq: 0, fds: 0, abs: 0, exc: 0 };
  for (const { s } of linhas) for (const k of COLS) acc[k] += s[k];
  acc.h = Math.round(acc.h * 10) / 10;
  return acc;
}

function Total({ label, valor, sub, destaque }: { label: string; valor: React.ReactNode; sub?: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-slate-50/60 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums tracking-tight", destaque ? "text-amber-700" : "text-slate-900")}>{valor}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Legenda({ motor }: { motor: Motor }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      {(["M", "T", "N"] as Periodo[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: COR[k] }} />
          {motor.periodos[k]}
        </span>
      ))}
    </div>
  );
}

function LinhaPessoa({ motor, p, s, escala, limite, idx }: { motor: Motor; p: Pessoa; s: EstatPessoa; escala: number; limite: number; idx: number }) {
  const acima = s.h > limite;
  const pct = (v: number) => `${Math.min(100, (v / escala) * 100)}%`;
  const per = (["M", "T", "N"] as Periodo[]).filter((k) => s[k] > 0);
  return (
    <div className="grid grid-cols-1 items-center gap-2 border-b border-line py-3 last:border-0 md:grid-cols-[minmax(150px,220px)_1fr_minmax(140px,200px)_200px] md:gap-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Av nome={p.nome} idx={idx} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{p.nome}</div>
          <div className="text-xs text-slate-500">{s.t} turnos</div>
        </div>
      </div>

      <div className="flex items-center gap-3" title={`${p.nome}: ${s.h}h em ${s.t} turnos (referência ${limite}h)`}>
        <div className="relative h-2.5 flex-1 rounded-full bg-slate-100">
          <div className={cn("absolute inset-y-0 left-0 rounded-full", acima ? "bg-amber-500" : "bg-brand-500")} style={{ width: pct(s.h) }} />
          <div className="absolute -top-1 bottom-[-4px] w-px bg-slate-400" style={{ left: pct(limite) }} title={`Referência: ${limite}h`} />
        </div>
        <span className={cn("w-14 text-right text-sm font-semibold tabular-nums", acima ? "text-amber-700" : "text-slate-900")}>{s.h}h</span>
      </div>

      <div title={per.map((k) => `${motor.periodos[k]}: ${s[k]}`).join(" · ") || "Sem turnos"}>
        {s.t ? (
          <>
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded">
              {per.map((k) => (
                <div key={k} style={{ flexGrow: s[k], background: COR[k] }} className="first:rounded-l last:rounded-r" />
              ))}
            </div>
            <div className="mt-1 flex gap-3 text-[11px] tabular-nums text-slate-500">
              {(["M", "T", "N"] as Periodo[]).map((k) => (
                <span key={k}>
                  {k} {s[k]}
                </span>
              ))}
            </div>
          </>
        ) : (
          <span className="text-xs text-slate-400">sem turnos</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        <Pill v={s.piq} l={s.piq === 1 ? "piquete" : "piquetes"} />
        <Pill v={s.fds} l="fds" />
        <Pill v={s.abs} l={s.abs === 1 ? "dia ausente" : "dias ausente"} />
        <Pill v={s.exc} l={s.exc === 1 ? "exceção" : "exceções"} warn />
        {!s.piq && !s.fds && !s.abs && !s.exc && <span className="text-xs text-slate-300">—</span>}
      </div>
    </div>
  );
}

function Pill({ v, l, warn }: { v: number; l: string; warn?: boolean }) {
  if (!v) return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 tabular-nums ring-1 ring-inset", warn ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-50 text-slate-600 ring-slate-200")}>
      <b className="font-semibold">{v}</b> {l}
    </span>
  );
}

function Tabela({ motor, grupos }: { motor: Motor; grupos: { g: { id: string; nome: string }; linhas: Linha[] }[] }) {
  return (
    <Card bodyClass="p-0">
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
          {grupos.map(({ g, linhas }) => {
            const acc = soma(linhas);
            return [
              ...linhas.map(({ p, s }) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.nome}</td>
                  <td className="whitespace-nowrap">{g.nome}</td>
                  {COLS.map((k) => (
                    <td key={k} className="text-right tabular-nums">
                      {s[k]}
                    </td>
                  ))}
                </tr>
              )),
              <tr key={`${g.id}-total`} className="bg-slate-50 font-semibold">
                <td colSpan={2}>Total {g.nome}</td>
                {COLS.map((k) => (
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
