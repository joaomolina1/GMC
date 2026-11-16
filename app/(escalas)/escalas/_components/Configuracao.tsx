"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addDays, fmtDMY, hmToMin, minToHM, todayISO, DIAS, dow } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import { PERIODOS, type Dataset, type Grupo, type Necessidade, type Periodo, type Regras, type Slot } from "@lib/escalas/tipos";
import { cn } from "@lib/utils";
import { ok, sb, useAcoes, useMotor } from "../_lib/contexto";
import { useGuardaSaida } from "../_lib/guarda";
import { DEFINICOES } from "./excel";
import { Button, Card, inputSm, Loading, Note, Table, useDialogo } from "./ui";

interface Rascunho {
  regras: Regras;
  periodos: Record<Periodo, string>;
  grupos: Grupo[];
  slots: Slot[];
  necessidades: Necessidade[];
}
const doDataset = (ds: Dataset): Rascunho =>
  JSON.parse(JSON.stringify({ regras: ds.regras, periodos: ds.periodos, grupos: ds.grupos, slots: ds.slots, necessidades: ds.necessidades }));

export function Configuracao() {
  const hoje = todayISO();
  const { motor, ds, loading, error } = useMotor(hoje, hoje);
  const { registar, refrescar } = useAcoes();
  const { toast, confirmar, pedirTexto } = useDialogo();
  const [D, setD] = useState<Rascunho | null>(null);
  const [gNec, setGNec] = useState<string>("");
  const [aGravar, setAGravar] = useState(false);
  const base = useMemo(() => (ds ? doDataset(ds) : null), [ds]);
  useEffect(() => {
    if (base && !D) setD(base);
  }, [base, D]);
  const sujo = !!(D && base && JSON.stringify(D) !== JSON.stringify(base));

  async function guardar(): Promise<boolean> {
    if (!D) return false;
    const mal = D.slots.find((s) => !s.etiqueta.trim() || s.fimMin <= s.inicioMin);
    if (mal) {
      toast(`Slot ${mal.id}: verifique a etiqueta e as horas.`, "bad");
      return false;
    }
    setAGravar(true);
    try {
      ok(
        await sb().rpc("escala_guardar_config", {
          c: {
            regras: D.regras,
            periodos: PERIODOS.map((k) => ({ codigo: k, nome: D.periodos[k] })),
            grupos: D.grupos.map((g, i) => ({ ...g, ordem: i + 1 })),
            slots: D.slots.map((s, i) => ({ ...s, ordem: i + 1 })),
            necessidades: D.necessidades,
          },
        })
      );
      await registar("Configuração alterada", "Regras, slots, grupos ou necessidades");
      await refrescar();
      setD(null);
      toast("Configuração guardada.", "ok");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
      return false;
    } finally {
      setAGravar(false);
    }
  }
  useGuardaSaida(sujo, guardar, () => setD(null));

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor || !D || !base) return <Loading />;
  const upd = (f: (d: Rascunho) => void) =>
    setD((o) => {
      const n = JSON.parse(JSON.stringify(o)) as Rascunho;
      f(n);
      return n;
    });
  const G = gNec && D.grupos.some((g) => g.id === gNec) ? gNec : D.grupos[0]?.id;

  async function novoGrupo() {
    const nome = await pedirTexto({ titulo: "Novo grupo", label: "Nome do grupo", ok: "Criar" });
    if (!nome) return;
    let id = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "GRP";
    if (id.length < 2) id += "X";
    while (D!.grupos.some((g) => g.id === id)) id = (id + "X").slice(0, 12);
    upd((d) => d.grupos.push({ id, nome, ordem: d.grupos.length + 1, estimado: false, ativo: true, minimos: {} }));
  }

  return (
    <>
      <Note kind={sujo ? "warn" : "info"}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">{sujo ? <b>Tem alterações por guardar.</b> : "A configuração aplica-se a toda a equipa."}</span>
          <Button size="sm" disabled={!sujo || aGravar} onClick={guardar}>
            Guardar alterações
          </Button>
          <Button size="sm" variant="outline" disabled={!sujo} onClick={() => setD(base)}>
            Descartar
          </Button>
        </div>
      </Note>

      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <Card title="Regras" sub="Limites flexíveis: o sistema avisa e a coordenação pode forçar com justificação" className="mb-0">
          {DEFINICOES.map(([k, t, u]) => (
            <div key={k} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">{t}</div>
                <div className="text-xs text-slate-400">{u}</div>
              </div>
              {typeof D.regras[k] === "boolean" ? (
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={D.regras[k] as boolean} onChange={(e) => upd((d) => ((d.regras as unknown as Record<string, unknown>)[k] = e.target.checked))} />
              ) : (
                <input
                  type="number"
                  min={0}
                  className={cn(inputSm, "w-20 text-right")}
                  value={D.regras[k] as number}
                  onChange={(e) => upd((d) => ((d.regras as unknown as Record<string, unknown>)[k] = Math.max(0, +e.target.value || 0)))}
                />
              )}
            </div>
          ))}
        </Card>

        <div>
          <Card title="Grupos" sub="O mínimo por período conta também quem “integra” o grupo à semana" bodyClass="p-0">
            <Table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  {PERIODOS.map((k) => (
                    <th key={k} className="text-right">
                      Mín. {k}
                    </th>
                  ))}
                  <th>Estimado</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {D.grupos.map((g, i) => (
                  <tr key={g.id}>
                    <td className="font-semibold">{g.id}</td>
                    <td>
                      <input className={cn(inputSm, "w-36")} value={g.nome} onChange={(e) => upd((d) => (d.grupos[i].nome = e.target.value))} />
                    </td>
                    {PERIODOS.map((k) => (
                      <td key={k} className="text-right">
                        <input
                          type="number"
                          min={0}
                          className={cn(inputSm, "w-14 text-right")}
                          value={g.minimos[k] ?? 0}
                          onChange={(e) => upd((d) => (d.grupos[i].minimos[k] = Math.max(0, +e.target.value || 0)))}
                        />
                      </td>
                    ))}
                    <td>
                      <input type="checkbox" className="accent-brand-500" checked={g.estimado} onChange={(e) => upd((d) => (d.grupos[i].estimado = e.target.checked))} />
                    </td>
                    <td>
                      <input type="checkbox" className="accent-brand-500" checked={g.ativo} onChange={(e) => upd((d) => (d.grupos[i].ativo = e.target.checked))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-line px-5 py-3">
              <Button size="sm" variant="outline" onClick={novoGrupo}>
                <Plus size={14} /> Grupo
              </Button>
            </div>
          </Card>
          <Card title="Nomes dos períodos" className="mb-0">
            <div className="flex flex-wrap gap-3">
              {PERIODOS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <b>{k}</b>
                  <input className={cn(inputSm, "w-28")} value={D.periodos[k]} onChange={(e) => upd((d) => (d.periodos[k] = e.target.value))} />
                </label>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5" title="Slots (horários)" sub="Se o fim for anterior ao início, o turno termina no dia seguinte · desative em vez de apagar para manter o histórico" bodyClass="p-0">
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Etiqueta</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Período</th>
              <th>Piquete</th>
              <th>Nota</th>
              <th>Ativo</th>
              <th className="text-right">Horas</th>
            </tr>
          </thead>
          <tbody>
            {D.slots.map((s, i) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.id}</td>
                <td>
                  <input className={cn(inputSm, "w-24")} value={s.etiqueta} onChange={(e) => upd((d) => (d.slots[i].etiqueta = e.target.value))} />
                </td>
                <td>
                  <input
                    type="time"
                    className={inputSm}
                    value={minToHM(s.inicioMin)}
                    onChange={(e) =>
                      upd((d) => {
                        const a = hmToMin(e.target.value);
                        if (Number.isNaN(a)) return;
                        const dur = d.slots[i].fimMin - d.slots[i].inicioMin;
                        const fimHM = (d.slots[i].inicioMin + dur) % 1440;
                        d.slots[i].inicioMin = a;
                        d.slots[i].fimMin = fimHM <= a ? fimHM + 1440 : fimHM;
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className={inputSm}
                    value={minToHM(s.fimMin)}
                    onChange={(e) =>
                      upd((d) => {
                        const b = hmToMin(e.target.value);
                        if (Number.isNaN(b)) return;
                        d.slots[i].fimMin = b <= d.slots[i].inicioMin ? b + 1440 : b;
                      })
                    }
                  />
                </td>
                <td>
                  <select className={inputSm} value={s.periodo} onChange={(e) => upd((d) => (d.slots[i].periodo = e.target.value as Periodo))}>
                    {PERIODOS.map((k) => (
                      <option key={k} value={k}>
                        {D.periodos[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="checkbox" className="accent-brand-500" checked={s.piquete} onChange={(e) => upd((d) => (d.slots[i].piquete = e.target.checked))} />
                </td>
                <td>
                  <input className={cn(inputSm, "w-48")} value={s.nota} onChange={(e) => upd((d) => (d.slots[i].nota = e.target.value))} />
                </td>
                <td>
                  <input type="checkbox" className="accent-brand-500" checked={s.ativo} onChange={(e) => upd((d) => (d.slots[i].ativo = e.target.checked))} />
                </td>
                <td className="text-right tabular-nums">{Math.round((s.fimMin - s.inicioMin) / 6) / 10}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="border-t border-line px-5 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              upd((d) => {
                let n = d.slots.length + 1;
                while (d.slots.some((s) => s.id === `S${n}`)) n++;
                d.slots.push({ id: `S${n}`, etiqueta: "08–16", inicioMin: 480, fimMin: 960, periodo: "M", piquete: false, nota: "", ordem: n, ativo: true, horas: 8 });
              })
            }
          >
            <Plus size={14} /> Slot
          </Button>
        </div>
      </Card>

      <Card
        title="Necessidades padrão"
        sub="Mínimo–máximo de pessoas por slot · alterações pontuais fazem-se na grelha"
        actions={
          <select className={inputSm} value={G} onChange={(e) => setGNec(e.target.value)}>
            {D.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        }
        bodyClass="p-0"
      >
        <Table>
          <thead>
            <tr>
              <th>Slot</th>
              <th className="text-right">Semana mín.</th>
              <th className="text-right">Semana máx.</th>
              <th className="text-right">FDS mín.</th>
              <th className="text-right">FDS máx.</th>
            </tr>
          </thead>
          <tbody>
            {D.slots
              .filter((s) => s.ativo)
              .sort((a, b) => a.inicioMin - b.inicioMin)
              .map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">
                    <b>{s.etiqueta}</b> <span className="text-xs text-slate-400">{D.periodos[s.periodo]}</span>
                  </td>
                  {(["SEMANA", "FDS"] as const).flatMap((tipo) =>
                    [0, 1].map((i) => {
                      const cur = D.necessidades.find((n) => n.grupoId === G && n.slotId === s.id && n.tipoDia === tipo);
                      return (
                        <td key={tipo + i} className="text-right">
                          <input
                            type="number"
                            min={0}
                            className={cn(inputSm, "w-16 text-right")}
                            value={cur ? (i ? cur.maximo : cur.minimo) : 0}
                            onChange={(e) =>
                              upd((d) => {
                                const v = Math.max(0, +e.target.value || 0);
                                let n = d.necessidades.find((x) => x.grupoId === G && x.slotId === s.id && x.tipoDia === tipo);
                                if (!n) d.necessidades.push((n = { grupoId: G!, slotId: s.id, tipoDia: tipo, minimo: 0, maximo: 0 }));
                                if (i) {
                                  n.maximo = v;
                                  if (n.minimo > v) n.minimo = v;
                                } else {
                                  n.minimo = v;
                                  if (n.maximo < v) n.maximo = v;
                                }
                                d.necessidades = d.necessidades.filter((x) => x.minimo > 0 || x.maximo > 0);
                              })
                            }
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>

      <Feriados motor={motor} onChange={refrescar} registar={registar} toast={toast} confirmar={confirmar} />

      <Card title="Pressupostos por confirmar" sub="Pontos do documento original que ficaram em aberto">
        {[
          "Os turnos do documento são de 8 horas. Com 40h semanais, isso são 5 turnos por semana.",
          "“1-2” foi lido como mínimo 1, máximo 2. A cobertura mede-se contra o mínimo; a sugestão pode completar até ao máximo.",
          "O mínimo de 5 na redação (3 manhã + 2 tarde) aplica-se só aos dias úteis (não fins de semana nem feriados), porque a tabela de fim de semana só prevê 3 pessoas.",
          "“3 folgas por fim de semana” foi lido como: cada fim de semana trabalhado dá 2 folgas (antes ou depois); numa sequência de 3 ou mais, dá 3. Ajuste nas Regras.",
          "Faltam necessidades de Chefes ao fim de semana, Coordenadores, Pivots e Produção: estão estimadas (marcadas como “estimado”).",
          "“Ciclos de 7 dias alternados” está sinalizado mas não é imposto automaticamente: falta saber o padrão exato.",
          "Feriados: contam como dias não úteis para férias e compensações. Por omissão usam as necessidades de semana; ative a regra “Feriados usam as necessidades de fim de semana” se for o caso.",
        ].map((t) => (
          <Note key={t}>{t}</Note>
        ))}
      </Card>
    </>
  );
}

function Feriados({
  motor,
  onChange,
  registar,
  toast,
  confirmar,
}: {
  motor: Motor;
  onChange: () => Promise<unknown>;
  registar: (a: string, d: string) => Promise<void>;
  toast: (m: string, k?: "ok" | "bad" | "info") => void;
  confirmar: ReturnType<typeof useDialogo>["confirmar"];
}) {
  const anoAtual = +todayISO().slice(0, 4);
  const anos = [...new Set([anoAtual, anoAtual + 1, ...motor.ds.feriados.map((f) => +f.data.slice(0, 4))])].sort();
  const [ano, setAno] = useState(String(anoAtual + 1));
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const [ambito, setAmbito] = useState("NACIONAL");
  const lista = motor.ds.feriados.filter((f) => f.data.startsWith(ano));

  async function juntar() {
    if (!data || !nome.trim()) return toast("Indique a data e o nome.", "bad");
    try {
      ok(await sb().from("escala_feriados").upsert({ data, nome: nome.trim(), ambito }));
      await registar("Feriado registado", `${fmtDMY(data)} · ${nome.trim()}`);
      await onChange();
      setData("");
      setNome("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }
  async function apagar(d: string, n: string) {
    if (!(await confirmar({ titulo: "Apagar feriado", texto: `Apagar ${n} (${fmtDMY(d)})?`, ok: "Apagar", perigo: true }))) return;
    try {
      ok(await sb().from("escala_feriados").delete().eq("data", d));
      await registar("Feriado apagado", `${fmtDMY(d)} · ${n}`);
      await onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  return (
    <Card
      title="Feriados"
      sub="Assinalados na grelha; não contam como dias úteis de férias nem para folgas de compensação"
      actions={
        <select className={inputSm} value={ano} onChange={(e) => setAno(e.target.value)}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      }
      bodyClass="p-0"
    >
      <Table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Dia</th>
            <th>Feriado</th>
            <th>Âmbito</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.data}>
              <td className="whitespace-nowrap tabular-nums">{fmtDMY(f.data)}</td>
              <td>{DIAS[dow(f.data)]}</td>
              <td>{f.nome}</td>
              <td className="text-xs text-slate-500">{f.ambito.toLowerCase()}</td>
              <td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => apagar(f.data, f.nome)} title="Apagar">
                  <Trash2 size={14} />
                </Button>
              </td>
            </tr>
          ))}
          {!lista.length && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                Sem feriados registados em {ano}.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <input type="date" className={inputSm} value={data} min={addDays(`${ano}-01-01`, -366)} onChange={(e) => setData(e.target.value)} />
        <input className={cn(inputSm, "w-56")} placeholder="Nome (ex.: Feriado municipal)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <select className={inputSm} value={ambito} onChange={(e) => setAmbito(e.target.value)}>
          <option value="NACIONAL">nacional</option>
          <option value="LOCAL">local</option>
          <option value="EMPRESA">empresa</option>
        </select>
        <Button size="sm" variant="outline" onClick={juntar}>
          <Plus size={14} /> Feriado
        </Button>
      </div>
    </Card>
  );
}
