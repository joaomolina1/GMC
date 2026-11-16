"use client";

import { useState } from "react";
import { KeyRound, Search, UserPlus } from "lucide-react";
import { addDays, dRange, fmt, todayISO } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import { PAPEL_LABEL, PERIODOS, podeAdministrar, type Papel, type Periodo, type Pessoa } from "@lib/escalas/tipos";
import { cn } from "@lib/utils";
import { ErroApi, ok, sb, useAcoes, useMotor, useSessao } from "../_lib/contexto";
import { Av, Button, Card, Check, Field, inputCls, inputSm, Loading, Modal, Note, SecHead, Table, Tag, useDialogo } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function Pessoas() {
  const hoje = todayISO();
  const ano = hoje.slice(0, 4);
  const from = addDays(hoje, -56) < `${ano}-01-01` ? addDays(hoje, -56) : `${ano}-01-01`;
  const { motor, loading, error } = useMotor(from, addDays(hoje, 120));
  const sessao = useSessao();
  const [q, setQ] = useState("");
  const [g, setG] = useState("");
  const [form, setForm] = useState<Pessoa | "novo" | null>(null);
  const [conta, setConta] = useState<Pessoa | null>(null);

  if (error) return <Note kind="bad">{error}</Note>;
  if (loading || !motor) return <Loading />;
  const todas = motor.ds.pessoas;
  const ativas = todas.filter((p) => p.ativo);
  const semEmail = ativas.filter((p) => !p.email);
  const semConta = ativas.filter((p) => p.email && !p.userId);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = todas
    .filter((p) => (!g || p.grupoId === g) && (!q || norm(p.nome).includes(norm(q)) || norm(p.email ?? "").includes(norm(q))))
    .sort((a, b) => Number(!a.ativo) - Number(!b.ativo) || a.nome.localeCompare(b.nome, "pt"));
  const turnos8 = (id: string) => dRange(addDays(hoje, -56), hoje).filter((d) => motor.turnoDe(id, d)).length;

  return (
    <>
      <Card
        title="Pessoas"
        sub={`${ativas.length} ativas · ${todas.length - ativas.length} inativas`}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={cn(inputSm, "w-44 pl-7")} placeholder="Procurar pessoa" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={inputSm} value={g} onChange={(e) => setG(e.target.value)}>
              <option value="">Todos os grupos</option>
              {motor.grupos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => setForm("novo")}>
              <UserPlus size={14} /> Nova pessoa
            </Button>
          </>
        }
        bodyClass="p-0"
      >
        {(semEmail.length > 0 || semConta.length > 0) && (
          <div className="border-b border-line px-5 py-3">
            {semEmail.length > 0 && (
              <Note kind="warn">
                <b>{semEmail.length} pessoa(s) sem email</b> não conseguem iniciar sessão: {semEmail.slice(0, 8).map((p) => p.nome).join(", ")}
                {semEmail.length > 8 ? " e outras" : ""}.
              </Note>
            )}
            {semConta.length > 0 && (
              <Note kind="warn">
                <b>{semConta.length} pessoa(s) sem conta de acesso</b>: {semConta.slice(0, 8).map((p) => p.nome).join(", ")}. Abra a ficha e crie a conta.
              </Note>
            )}
          </div>
        )}
        <Table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Grupo</th>
              <th>Conta</th>
              <th>Preferência</th>
              <th>Particularidades</th>
              <th className="text-right">Turnos (8 sem.)</th>
              <th className="text-right">Férias {ano}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const tg: React.ReactNode[] = [];
              if (p.todosFds) tg.push(<Tag key="t" kind="warn">todos os fds</Tag>);
              if (p.soFds) tg.push(<Tag key="s" kind="warn">só fds</Tag>);
              if (p.integraGrupoId) tg.push(<Tag key="i">integra {motor.nomeGrupo(p.integraGrupoId)} à semana</Tag>);
              if (p.alternaCom) tg.push(<Tag key="a" kind="warn">alterna com {todas.find((x) => x.id === p.alternaCom)?.nome}</Tag>);
              if (p.ciclo7) tg.push(<Tag key="c" kind="warn">ciclos de 7 dias</Tag>);
              if (p.papel !== "TRABALHADOR") tg.push(<Tag key="p" kind="brand">{PAPEL_LABEL[p.papel].toLowerCase()}</Tag>);
              if (!p.ativo) tg.push(<Tag key="x" kind="bad">inativa</Tag>);
              return (
                <tr key={p.id} className={cn("cursor-pointer hover:bg-slate-50", !p.ativo && "opacity-60")} onClick={() => setForm(p)}>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Av nome={p.nome} idx={motor.grupos.findIndex((x) => x.id === p.grupoId)} />
                      <div>
                        <div className="font-medium text-slate-900">{p.nome}</div>
                        <div className="font-mono text-[11px] text-slate-400">{p.email ?? p.codigo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{motor.nomeGrupo(p.grupoId)}</td>
                  <td>{p.userId ? <Tag kind="ok">ativa</Tag> : p.email ? <Tag kind="warn">por criar</Tag> : <Tag kind="bad">sem email</Tag>}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {p.periodos.map((x) => (
                        <Tag key={x}>{motor.periodos[x]}</Tag>
                      ))}
                      {p.fazFds && <Tag kind="ok">FDS</Tag>}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">{tg.length ? tg : <span className="text-slate-400">—</span>}</div>
                  </td>
                  <td className="text-right tabular-nums">{turnos8(p.id)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {motor.feriasUsadas(p.id, ano)}/{motor.feriasSaldo(p.id, ano)}
                  </td>
                  <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    {p.email && (podeAdministrar(sessao.papel) || p.papel === "TRABALHADOR") && (
                      <Button size="sm" variant="ghost" title={p.userId ? "Repor palavra-passe" : "Criar conta"} onClick={() => setConta(p)}>
                        <KeyRound size={14} />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      {form && <FormPessoa motor={motor} p={form === "novo" ? null : form} grupoInicial={g} onClose={() => setForm(null)} onConta={(x) => setConta(x)} />}
      {conta && <ModalConta p={conta} onClose={() => setConta(null)} />}
    </>
  );
}

function ModalConta({ p, onClose }: { p: Pessoa; onClose: () => void }) {
  const { conta, refrescar } = useAcoes();
  const { toast } = useDialogo();
  const [pw, setPw] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const criar = !p.userId;
  async function go() {
    setAGravar(true);
    try {
      const r = await conta(p.id, criar ? "criar" : "repor", pw);
      await refrescar();
      toast(r.ligada ? "Conta existente ligada à ficha." : criar ? "Conta criada." : "Palavra-passe reposta.", "ok");
      onClose();
    } catch (e) {
      toast(e instanceof ErroApi || e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }
  return (
    <Modal
      open
      title={criar ? `Criar conta · ${p.nome}` : `Repor palavra-passe · ${p.nome}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={aGravar || pw.length < 8} onClick={go}>
            {criar ? "Criar conta" : "Repor"}
          </Button>
        </>
      }
    >
      <Note>
        Conta <b className="font-mono">{p.email}</b>. Defina uma palavra-passe temporária e comunique-a à pessoa: no próximo acesso vai ter de escolher uma nova.
        {criar && " A conta nova só dá acesso às Escalas."}
      </Note>
      <Field label="Palavra-passe temporária" hint="Pelo menos 8 caracteres.">
        <input type="text" autoComplete="off" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
    </Modal>
  );
}

function FormPessoa({
  motor,
  p,
  grupoInicial,
  onClose,
  onConta,
}: {
  motor: Motor;
  p: Pessoa | null;
  grupoInicial: string;
  onClose: () => void;
  onConta: (p: Pessoa) => void;
}) {
  const sessao = useSessao();
  const admin = podeAdministrar(sessao.papel);
  const { registar, refrescar, conta } = useAcoes();
  const { toast, confirmar } = useDialogo();
  const ano = todayISO().slice(0, 4);
  const [x, setX] = useState({
    nome: p?.nome ?? "",
    codigo: p?.codigo ?? "",
    grupoId: p?.grupoId ?? (grupoInicial || motor.grupos[0]?.id || ""),
    papel: (p?.papel ?? "TRABALHADOR") as Papel,
    email: p?.email ?? "",
    ferias: p ? motor.feriasSaldo(p.id, ano) : motor.regras.feriasDiasAno,
    periodos: p?.periodos ?? (["M"] as Periodo[]),
    fazFds: p?.fazFds ?? true,
    todosFds: p?.todosFds ?? false,
    soFds: p?.soFds ?? false,
    alternaCom: p?.alternaCom ?? "",
    integra: p?.integraGrupoId ?? "",
    ciclo7: p?.ciclo7 ?? false,
    ativo: p?.ativo ?? true,
    notas: p?.notas ?? "",
  });
  const [criarConta, setCriarConta] = useState(true);
  const [pw, setPw] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const set = <K extends keyof typeof x>(k: K, v: (typeof x)[K]) => setX((o) => ({ ...o, [k]: v }));
  const podeEmail = admin || !p;

  async function guardar() {
    const nome = x.nome.trim();
    if (!nome) return toast("Indique o nome.", "bad");
    const email = x.email.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) return toast("O email não tem um formato válido.", "bad");
    const dup = email && motor.ds.pessoas.find((o) => o.id !== p?.id && o.email === email);
    if (dup) return toast(`Este email já está registado para ${dup.nome}.`, "bad");
    if (!p && email && criarConta && pw.length < 8) return toast("Defina uma palavra-passe temporária com pelo menos 8 caracteres.", "bad");
    setAGravar(true);
    try {
      let codigo = p?.codigo ?? (slug(x.codigo || nome) || `p-${Date.now().toString(36)}`);
      if (!p && motor.ds.pessoas.some((o) => o.codigo === codigo)) codigo = `${codigo}-${Math.random().toString(36).slice(2, 5)}`;
      const payload: Record<string, unknown> = {
        id: p?.id ?? null,
        codigo,
        nome,
        grupo_id: x.grupoId,
        faz_fds: x.fazFds || x.todosFds || x.soFds,
        todos_fds: x.todosFds,
        so_fds: x.soFds,
        integra_grupo_id: x.integra || null,
        ciclo7: x.ciclo7,
        ativo: x.ativo,
        notas: x.notas.trim(),
        periodos: x.periodos,
        ferias_dias: Math.max(0, x.ferias || 0),
        ano: +ano,
        alterna_com: x.alternaCom || null,
      };
      if (podeEmail) payload.email = email || null;
      if (admin || !p) payload.papel = admin ? x.papel : "TRABALHADOR";
      const id = ok(await sb().rpc("escala_guardar_pessoa", { p: payload })) as string;
      await registar(p ? "Pessoa editada" : "Pessoa criada", `${nome} · ${motor.nomeGrupo(x.grupoId)} · ${x.periodos.join("/")}${x.fazFds ? "+FDS" : ""}`);
      if (!p && email && criarConta) {
        try {
          await conta(id, "criar", pw);
        } catch (e) {
          toast(`Pessoa criada, mas a conta não: ${e instanceof Error ? e.message : ""}`, "bad");
        }
      }
      await refrescar();
      toast("Guardado.", "ok");
      if (p) {
        const hoje = todayISO();
        const inval = motor.ds.turnos
          .filter((t) => t.pessoaId === p.id && t.data >= hoje && !x.periodos.includes(motor.slot(t.slotId)!.periodo))
          .map((t) => `${fmt(t.data)} ${motor.slot(t.slotId)?.etiqueta}`);
        if (inval.length)
          await confirmar({
            titulo: "Turnos futuros fora da nova preferência",
            texto: <Note kind="warn">{inval.length} turno(s) futuro(s) deixam de respeitar a preferência: {inval.join(", ")}. Reveja-os na grelha.</Note>,
            ok: "Entendido",
          });
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    } finally {
      setAGravar(false);
    }
  }

  async function eliminar() {
    if (!p) return;
    if (!(await confirmar({ titulo: "Eliminar pessoa", texto: <>Eliminar <b>{p.nome}</b> definitivamente? A conta de acesso, se existir, deixa de dar acesso às Escalas.</>, ok: "Eliminar", perigo: true }))) return;
    try {
      ok(await sb().from("escala_pessoas").delete().eq("id", p.id));
      await registar("Pessoa eliminada", p.nome);
      await refrescar();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro", "bad");
    }
  }

  return (
    <Modal
      open
      wide
      title={p ? `Editar · ${p.nome}` : "Nova pessoa"}
      onClose={onClose}
      footer={
        <>
          {p && admin && (
            <Button variant="danger" size="sm" className="mr-auto" onClick={eliminar}>
              Eliminar
            </Button>
          )}
          {p?.email && (admin || p.papel === "TRABALHADOR") && (
            <Button variant="outline" size="sm" onClick={() => onConta(p)}>
              <KeyRound size={14} /> {p.userId ? "Repor palavra-passe" : "Criar conta"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={aGravar} onClick={guardar}>
            {aGravar ? "A gravar…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome">
          <input className={inputCls} value={x.nome} onChange={(e) => set("nome", e.target.value)} />
        </Field>
        <Field label="Identificador" hint={p ? undefined : "Gerado a partir do nome; liga turnos e ausências no Excel."}>
          <input className={inputCls} value={p ? p.codigo : x.codigo} placeholder={slug(x.nome)} disabled={!!p} onChange={(e) => set("codigo", e.target.value)} />
        </Field>
        <Field label="Grupo">
          <select className={inputCls} value={x.grupoId} onChange={(e) => set("grupoId", e.target.value)}>
            {motor.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Papel" hint={admin ? undefined : "Só a administração altera papéis."}>
          <select className={inputCls} value={x.papel} disabled={!admin} onChange={(e) => set("papel", e.target.value as Papel)}>
            {(Object.keys(PAPEL_LABEL) as Papel[]).map((k) => (
              <option key={k} value={k}>
                {PAPEL_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email de acesso" hint={podeEmail ? "Sem email, a pessoa não consegue entrar." : "Só a administração altera o email."}>
          <input type="email" className={inputCls} value={x.email} disabled={!podeEmail} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label={`Dias de férias em ${ano}`}>
          <input type="number" min={0} max={60} className={inputCls} value={x.ferias} onChange={(e) => set("ferias", +e.target.value)} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Coordenação gere a escala; Administração também gere papéis, contas da coordenação e importações. Trabalhador vê apenas os seus turnos e pedidos.
      </p>

      {!p && x.email && (
        <div className="mt-3 rounded-xl border border-line bg-slate-50 p-3">
          <Check label="Criar já a conta de acesso" checked={criarConta} onChange={setCriarConta} />
          {criarConta && (
            <Field label="Palavra-passe temporária" hint="A pessoa tem de a mudar no primeiro acesso." className="mt-2 max-w-xs">
              <input type="text" autoComplete="off" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      <SecHead>Períodos que pode fazer (perfil)</SecHead>
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((k) => (
          <Check key={k} label={motor.periodos[k]} checked={x.periodos.includes(k)} onChange={(v) => set("periodos", v ? PERIODOS.filter((y) => y === k || x.periodos.includes(y)) : x.periodos.filter((y) => y !== k))} />
        ))}
      </div>
      <SecHead>Fins de semana</SecHead>
      <div className="flex flex-wrap gap-1.5">
        <Check label="Faz fins de semana" checked={x.fazFds} onChange={(v) => set("fazFds", v)} />
        <Check label="Trabalha todos os fins de semana" checked={x.todosFds} onChange={(v) => set("todosFds", v)} />
        <Check label="Só fins de semana" checked={x.soFds} onChange={(v) => set("soFds", v)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Alterna com (não podem folgar juntos)">
          <select className={inputCls} value={x.alternaCom} onChange={(e) => set("alternaCom", e.target.value)}>
            <option value="">—</option>
            {motor.pessoas
              .filter((o) => o.id !== p?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} · {motor.nomeGrupo(o.grupoId)}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Integra também, à semana, o grupo">
          <select className={inputCls} value={x.integra} onChange={(e) => set("integra", e.target.value)}>
            <option value="">—</option>
            {motor.grupos
              .filter((g) => g.id !== x.grupoId)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Check label="Ciclos de 7 dias alternados (sinalizado)" checked={x.ciclo7} onChange={(v) => set("ciclo7", v)} />
        <Check label="Ativa" checked={x.ativo} onChange={(v) => set("ativo", v)} />
      </div>
      <Field label="Notas" className="mt-3">
        <textarea rows={2} className={inputCls} value={x.notas} onChange={(e) => set("notas", e.target.value)} />
      </Field>
    </Modal>
  );
}
