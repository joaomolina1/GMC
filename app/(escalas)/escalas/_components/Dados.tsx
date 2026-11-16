"use client";

import { useRef, useState } from "react";
import { FileDown, FileUp } from "lucide-react";
import { carregarDataset } from "@lib/escalas/dados";
import { addDays, fmtDMY, mondayOf, todayISO } from "@lib/escalas/datas";
import { Motor } from "@lib/escalas/motor";
import { podeAdministrar } from "@lib/escalas/tipos";
import { ok, sb, useAcoes, useSessao, type ErroLote } from "../_lib/contexto";
import { exportarExcel, lerExcel, type Importacao } from "./excel";
import { Button, Card, Check, Field, inputCls, Modal, Note, useDialogo } from "./ui";

export function Dados() {
  const sessao = useSessao();
  const admin = podeAdministrar(sessao.papel);
  const ws = mondayOf(todayISO());
  const [de, setDe] = useState(addDays(ws, -7));
  const [ate, setAte] = useState(addDays(ws, 27));
  const [aExportar, setAExportar] = useState(false);
  const [imp, setImp] = useState<{ dados: Importacao; nome: string; motor: Motor } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useDialogo();

  async function exportar() {
    if (!de || !ate || de > ate) return toast("Intervalo inválido.", "bad");
    setAExportar(true);
    try {
      const ds = await carregarDataset(sb(), de, ate, { todasAusencias: true });
      await exportarExcel(new Motor(ds), de, ate);
      toast("Ficheiro exportado.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAExportar(false);
    }
  }

  async function ler(f: File) {
    try {
      const motor = new Motor(await carregarDataset(sb(), addDays(todayISO(), -30), addDays(todayISO(), 30)));
      const dados = await lerExcel(f, motor);
      if (!dados.config && !dados.pessoas && !dados.ausencias && !dados.turnos && !dados.necessidadesDia && !dados.feriados)
        return toast("O ficheiro não tem nenhuma das folhas esperadas (Pessoas, Turnos, Ausências, entre outras).", "bad");
      setImp({ dados, nome: f.name, motor });
    } catch (e) {
      toast(`Não foi possível ler o ficheiro: ${e instanceof Error ? e.message : ""}`, "bad");
    }
  }

  return (
    <>
      <Card title="Exportar para Excel" sub="Ficheiro com pessoas, configuração, ausências, feriados e os turnos do intervalo">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="De">
            <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
          </Field>
          <Field label="Até">
            <input type="date" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
          <Button onClick={exportar} disabled={aExportar}>
            <FileDown size={16} /> {aExportar ? "A preparar…" : "Exportar"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          O intervalo define as folhas “Escala …”, “Horas”, “Turnos” e “Necessidades por dia”. Pessoas, configuração, ausências e feriados vão completos.
        </p>
      </Card>

      <Card title="Importar de Excel" sub="Mesmo formato da exportação (e do ficheiro escalas_base.xlsx do protótipo)">
        {admin ? (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
            <Button
              variant="outline"
              onClick={() => {
                if (fileRef.current) fileRef.current.value = "";
                fileRef.current?.click();
              }}
            >
              <FileUp size={16} /> Escolher ficheiro
            </Button>
            <p className="mt-3 text-xs text-slate-500">
              Antes de gravar, mostra o que vai ser alterado. Pessoas são atualizadas pelo ID; turnos dos dias presentes no ficheiro substituem os existentes nesses dias; turnos que violem
              regras rígidas são ignorados e listados.
            </p>
          </>
        ) : (
          <Note>A importação é reservada à administração.</Note>
        )}
      </Card>
      {imp && <ModalImportar imp={imp.dados} nome={imp.nome} motor={imp.motor} onClose={() => setImp(null)} />}
    </>
  );
}

function ModalImportar({ imp, nome, motor, onClose }: { imp: Importacao; nome: string; motor: Motor; onClose: () => void }) {
  const { aplicarTurnos, registar, refrescar, conta } = useAcoes();
  const { toast } = useDialogo();
  const [criarContas, setCriarContas] = useState(false);
  const [pw, setPw] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [erros, setErros] = useState<ErroLote[] | null>(null);
  const existentes = new Set(motor.ds.pessoas.map((p) => p.codigo));
  const novas = imp.pessoas?.filter((p) => !existentes.has(p.codigo)) ?? [];
  const diasTurnos = [...new Set(imp.turnos?.map((t) => t.data) ?? [])].sort();

  async function aplicar() {
    if (criarContas && pw.length < 8) return toast("Defina a palavra-passe temporária (mín. 8 caracteres).", "bad");
    const falhas: ErroLote[] = [];
    try {
      if (imp.config) {
        setEstado("A gravar configuração…");
        ok(await sb().rpc("escala_guardar_config", { c: imp.config }));
      }
      if (imp.feriados?.length) {
        setEstado("A gravar feriados…");
        ok(await sb().from("escala_feriados").upsert(imp.feriados.map((f) => ({ data: f.data, nome: f.nome, ambito: f.ambito }))));
      }
      const idDe = new Map(motor.ds.pessoas.map((p) => [p.codigo, p.id]));
      if (imp.pessoas?.length) {
        const ano = +todayISO().slice(0, 4);
        let i = 0;
        for (const p of imp.pessoas) {
          setEstado(`A gravar pessoas… ${++i}/${imp.pessoas.length}`);
          try {
            const id = ok(
              await sb().rpc("escala_guardar_pessoa", {
                p: {
                  id: idDe.get(p.codigo) ?? null,
                  codigo: p.codigo,
                  nome: p.nome,
                  email: p.email || null,
                  grupo_id: p.grupoId,
                  papel: p.papel,
                  faz_fds: p.fazFds,
                  todos_fds: p.todosFds,
                  so_fds: p.soFds,
                  integra_grupo_id: p.integra || null,
                  ciclo7: p.ciclo7,
                  ativo: p.ativo,
                  notas: p.notas,
                  periodos: p.periodos,
                  ferias_dias: p.ferias,
                  ano,
                },
              })
            ) as string;
            const nova = !idDe.has(p.codigo);
            idDe.set(p.codigo, id);
            if (nova && criarContas && p.email) {
              try {
                await conta(id, "criar", pw);
              } catch (e) {
                falhas.push({ data: "", pessoaId: id, nome: p.nome, motivo: `conta: ${e instanceof Error ? e.message : ""}` });
              }
            }
          } catch (e) {
            falhas.push({ data: "", pessoaId: "", nome: p.nome, motivo: e instanceof Error ? e.message : "erro" });
          }
        }
        for (const p of imp.pessoas.filter((x) => x.alternaCodigo && idDe.get(x.alternaCodigo))) {
          const id = idDe.get(p.codigo);
          if (!id) continue;
          await sb().rpc("escala_guardar_pessoa", { p: { id, nome: p.nome, grupo_id: p.grupoId, integra_grupo_id: p.integra || null, alterna_com: idDe.get(p.alternaCodigo) } });
        }
      }
      if (imp.necessidadesDia?.length) {
        setEstado("A gravar necessidades por dia…");
        ok(
          await sb()
            .from("escala_necessidades_dia")
            .upsert(imp.necessidadesDia.map((n) => ({ data: n.data, grupo_id: n.grupoId, slot_id: n.slotId, minimo: n.minimo, maximo: n.maximo })))
        );
      }
      if (imp.ausencias?.length) {
        let i = 0;
        for (const a of imp.ausencias) {
          setEstado(`A gravar ausências… ${++i}/${imp.ausencias.length}`);
          const pessoa = idDe.get(a.codigo);
          if (!pessoa) continue;
          const body = { pessoa_id: pessoa, tipo: a.tipo, inicio: a.inicio, fim: a.fim, estado: a.estado, justificacao: a.justificacao, nota_decisao: a.nota, excecao: a.excecao };
          const r = a.id ? await sb().from("escala_ausencias").upsert({ id: a.id, ...body }) : await sb().from("escala_ausencias").insert(body);
          if (r.error) falhas.push({ data: a.inicio, pessoaId: pessoa, nome: a.codigo, motivo: r.error.message });
        }
      }
      if (imp.turnos?.length) {
        const ds = await carregarDataset(sb(), diasTurnos[0], diasTurnos[diasTurnos.length - 1]);
        const dias = new Set(diasTurnos);
        const retirar = ds.turnos.filter((t) => dias.has(t.data)).map((t) => ({ data: t.data, pessoaId: t.pessoaId }));
        const atribuir = imp.turnos
          .filter((t) => idDe.get(t.codigo))
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((t) => ({ data: t.data, slotId: t.slotId, pessoaId: idDe.get(t.codigo)!, origem: "IMPORTACAO" as const, justificacao: t.justificacao || "Importação Excel" }));
        const LOTE = 1000;
        for (let i = 0; i < Math.max(atribuir.length, 1); i += LOTE) {
          setEstado(`A gravar turnos… ${Math.min(i + LOTE, atribuir.length)}/${atribuir.length}`);
          const r = await aplicarTurnos({ retirar: i === 0 ? retirar : [], atribuir: atribuir.slice(i, i + LOTE), parcial: true });
          falhas.push(...(r.erros ?? []));
        }
      }
      await registar(`Importação Excel · ${nome}`, `${imp.pessoas?.length ?? 0} pessoas · ${imp.ausencias?.length ?? 0} ausências · ${imp.turnos?.length ?? 0} turnos${falhas.length ? ` · ${falhas.length} falha(s)` : ""}`);
      await refrescar();
      setEstado(null);
      if (falhas.length) setErros(falhas);
      else {
        toast("Importação concluída.", "ok");
        onClose();
      }
    } catch (e) {
      setEstado(null);
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  return (
    <Modal
      open
      wide
      title="Importar de Excel"
      onClose={estado ? () => {} : onClose}
      footer={
        erros ? (
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" disabled={!!estado} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={!!estado} onClick={aplicar}>
              {estado ?? "Importar"}
            </Button>
          </>
        )
      }
    >
      {erros ? (
        <>
          <Note kind="warn">Importação concluída com {erros.length} linha(s) não gravada(s):</Note>
          <ul className="max-h-80 list-disc overflow-y-auto pl-5 text-sm text-slate-700">
            {erros.slice(0, 200).map((e, i) => (
              <li key={i}>
                {e.nome} {e.data && `· ${fmtDMY(e.data)}`} {e.etiqueta && `· ${e.etiqueta}`} — {e.motivo}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <Note>
            <b>{nome}</b>
            <ul className="mt-1 list-disc pl-5">
              {imp.config && (
                <li>
                  <b>Configuração</b>: {[imp.config.grupos && `${imp.config.grupos.length} grupos`, imp.config.slots && `${imp.config.slots.length} slots`, imp.config.necessidades && `${imp.config.necessidades.length} necessidades`, imp.config.regras && "regras"].filter(Boolean).join(", ")}
                </li>
              )}
              {imp.pessoas && (
                <li>
                  <b>Pessoas</b>: {imp.pessoas.length} ({novas.length} novas, {imp.pessoas.length - novas.length} atualizadas)
                </li>
              )}
              {imp.ausencias && (
                <li>
                  <b>Ausências</b>: {imp.ausencias.length}
                </li>
              )}
              {imp.turnos && (
                <li>
                  <b>Turnos</b>: {imp.turnos.length} em {diasTurnos.length} dia(s)
                  {diasTurnos.length ? ` (${fmtDMY(diasTurnos[0])} a ${fmtDMY(diasTurnos[diasTurnos.length - 1])}); substituem os turnos existentes nesses dias` : ""}
                </li>
              )}
              {imp.necessidadesDia && (
                <li>
                  <b>Necessidades por dia</b>: {imp.necessidadesDia.length}
                </li>
              )}
              {imp.feriados && (
                <li>
                  <b>Feriados</b>: {imp.feriados.length}
                </li>
              )}
            </ul>
          </Note>
          {imp.avisos.length > 0 && (
            <Note kind="warn">
              <b>Avisos</b>
              <ul className="list-disc pl-5">
                {imp.avisos.slice(0, 15).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Note>
          )}
          {novas.some((p) => p.email) && (
            <div className="mt-3 rounded-xl border border-line bg-slate-50 p-3">
              <Check label={`Criar contas de acesso para as ${novas.filter((p) => p.email).length} pessoa(s) novas com email`} checked={criarContas} onChange={setCriarContas} />
              {criarContas && (
                <Field label="Palavra-passe temporária" hint="Todas terão de a mudar no primeiro acesso." className="mt-2 max-w-xs">
                  <input type="text" autoComplete="off" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
                </Field>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
