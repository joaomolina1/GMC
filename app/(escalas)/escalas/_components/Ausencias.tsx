"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { addDays, dRange, fmt, fmtDMY, todayISO } from "@lib/escalas/datas";
import type { Motor } from "@lib/escalas/motor";
import { ESTADO_LABEL, TIPO_LABEL, type Anexo, type Ausencia, type EstadoAusencia, type TipoAusencia } from "@lib/escalas/tipos";
import { ok, sb, useAcoes, useSessao } from "../_lib/contexto";
import { Button, Field, inputCls, Modal, Note, useDialogo } from "./ui";

export const BUCKET = "escalas-comprovativos";
export const ACEITES = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx";
const MAX = 10 * 1024 * 1024;

export const fmtBytes = (n: number) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Envia o comprovativo para o Storage privado e regista-o na ausência. */
export async function enviarAnexo(pessoaId: string, ausenciaId: string, f: File) {
  if (f.size > MAX) throw new Error("O ficheiro tem mais de 10 MB.");
  const nome = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const caminho = `${pessoaId}/${ausenciaId}/${Date.now()}-${nome}`;
  const up = await sb().storage.from(BUCKET).upload(caminho, f, { contentType: f.type || undefined, upsert: false });
  if (up.error) throw new Error(`Não foi possível enviar o ficheiro: ${up.error.message}`);
  ok(await sb().from("escala_ausencia_anexos").insert({ ausencia_id: ausenciaId, caminho, nome: f.name, tamanho: f.size, tipo: f.type || "" }));
}

export async function abrirAnexo(a: Anexo) {
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(a.caminho, 120);
  if (error || !data) throw new Error("Não foi possível abrir o comprovativo.");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function ListaAnexos({ anexos }: { anexos: Anexo[] }) {
  const { toast } = useDialogo();
  if (!anexos.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {anexos.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => abrirAnexo(a).catch((e) => toast(e.message, "bad"))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
        >
          <Paperclip size={12} /> {a.nome} {a.tamanho ? <span className="text-slate-400">· {fmtBytes(a.tamanho)}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function CampoAnexo({ ficheiro, onChange, erro }: { ficheiro: File | null; onChange: (f: File | null) => void; erro?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={ACEITES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onChange(f);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className={erro ? "border-red-400" : ""} onClick={() => ref.current?.click()}>
          <Paperclip size={14} /> {ficheiro ? "Trocar ficheiro" : "Anexar comprovativo"}
        </Button>
        <span className={erro ? "text-sm text-red-600" : "text-sm text-slate-500"}>
          {ficheiro ? (
            <>
              <b className="text-slate-900">{ficheiro.name}</b> · {fmtBytes(ficheiro.size)}
            </>
          ) : erro ? (
            "O comprovativo é obrigatório para baixa médica."
          ) : (
            "Nenhum ficheiro anexado"
          )}
        </span>
        {ficheiro && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (ref.current) ref.current.value = "";
              onChange(null);
            }}
          >
            Remover
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">PDF, imagem ou Word, até 10 MB. Só a coordenação e a própria pessoa o podem ver.</p>
    </div>
  );
}

/** Registar ou editar ausência/folga (coordenação). */
export function FormAusencia({ motor, inicial, onClose }: { motor: Motor; inicial: Partial<Ausencia>; onClose: () => void }) {
  const { registar, refrescar } = useAcoes();
  const { toast } = useDialogo();
  const novo = !inicial.id;
  const [pessoa, setPessoa] = useState(inicial.pessoaId ?? motor.pessoas[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoAusencia>(inicial.tipo ?? "INDISPONIBILIDADE");
  const [de, setDe] = useState(inicial.inicio ?? todayISO());
  const [ate, setAte] = useState(inicial.fim ?? todayISO());
  const [estado, setEstado] = useState<EstadoAusencia>(inicial.estado ?? "APROVADA");
  const [just, setJust] = useState(inicial.justificacao ?? "");
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const fim = ate < de ? de : ate;
  const dias = de ? dRange(de, fim) : [];
  const conf = dias.filter((d) => motor.turnoDe(pessoa, d));
  const lg = tipo === "FOLGA" && motor.pessoa(pessoa) ? motor.saldoCompensacao(pessoa, addDays(de, -42), addDays(fim, 14)) : null;

  async function guardar() {
    if (!de || !pessoa) return toast("Indique a pessoa e as datas.", "bad");
    setAGravar(true);
    try {
      const body = { pessoa_id: pessoa, tipo, inicio: de, fim, estado, justificacao: just.trim() };
      let id = inicial.id;
      if (id) ok(await sb().from("escala_ausencias").update(body).eq("id", id));
      else {
        const r = ok(await sb().from("escala_ausencias").insert(body).select("id").single());
        id = (r as { id: string }).id;
      }
      if (ficheiro && id) await enviarAnexo(pessoa, id, ficheiro);
      await registar(
        novo ? "Ausência registada" : "Ausência editada",
        `${motor.pessoa(pessoa)?.nome} · ${TIPO_LABEL[tipo]} · ${fmtDMY(de)}–${fmtDMY(fim)} · ${ESTADO_LABEL[estado]}${estado === "APROVADA" && conf.length ? ` · ${conf.length} turno(s) retirado(s)` : ""}`
      );
      await refrescar();
      toast("Guardado.", "ok");
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
      title={novo ? "Registar ausência ou folga" : "Editar registo"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={aGravar} onClick={guardar}>
            {aGravar ? "A gravar…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pessoa">
          <select className={inputCls} value={pessoa} onChange={(e) => setPessoa(e.target.value)} disabled={!novo}>
            {motor.pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {motor.nomeGrupo(p.grupoId)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAusencia)}>
            {Object.entries(TIPO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} />
        </Field>
        <Field label="Até">
          <input type="date" className={inputCls} value={fim} min={de} onChange={(e) => setAte(e.target.value)} />
        </Field>
        <Field label="Estado">
          <select className={inputCls} value={estado} onChange={(e) => setEstado(e.target.value as EstadoAusencia)}>
            <option value="APROVADA">Aprovada</option>
            <option value="PENDENTE">Pendente</option>
            <option value="REJEITADA">Rejeitada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </Field>
      </div>
      <Field label="Justificação" className="mt-3">
        <textarea rows={3} className={inputCls} value={just} onChange={(e) => setJust(e.target.value)} />
      </Field>
      {tipo === "BAIXA" && (
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Comprovativo de baixa</span>
          {inicial.anexos?.length ? <div className="mb-2"><ListaAnexos anexos={inicial.anexos} /></div> : null}
          <CampoAnexo ficheiro={ficheiro} onChange={setFicheiro} />
        </div>
      )}
      <div className="mt-3">
        <Note>
          {dias.length} dia(s) · {motor.diasUteis(dias)} útil(eis).
        </Note>
        {conf.length > 0 && estado === "APROVADA" && <Note kind="warn">Tem turnos em {conf.length} destes dias: são retirados ao gravar como aprovada.</Note>}
        {tipo === "BAIXA" && !ficheiro && !inicial.anexos?.length && <Note kind="warn">Sem comprovativo: pode registar na mesma e anexar depois.</Note>}
        {lg && (
          <Note>
            Saldo de compensação (6 semanas à volta): {lg.dev} devidas, {lg.got} já cobertas por dias livres.
          </Note>
        )}
      </div>
    </Modal>
  );
}

export function resumoDias(motor: Motor, a: Pick<Ausencia, "inicio" | "fim">) {
  const dias = dRange(a.inicio, a.fim);
  return `${dias.length} dia(s), ${motor.diasUteis(dias)} útil(eis)`;
}

export const periodoTxt = (a: Pick<Ausencia, "inicio" | "fim">) => `${fmt(a.inicio)}${a.fim !== a.inicio ? ` – ${fmt(a.fim)}` : ""}`;

export function useSessaoPessoa() {
  return useSessao().pessoaId;
}
