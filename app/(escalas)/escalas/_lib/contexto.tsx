"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@lib/supabase/client";
import { carregarDataset, mensagemErro } from "@lib/escalas/dados";
import { Motor } from "@lib/escalas/motor";
import type { Sessao } from "@lib/escalas/tipos";
import type { ItemAtribuir, ItemRetirar } from "@lib/escalas/motor";

const SessaoCtx = createContext<Sessao | null>(null);

export function SessaoProvider({ sessao, children }: { sessao: Sessao; children: React.ReactNode }) {
  return <SessaoCtx.Provider value={sessao}>{children}</SessaoCtx.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(SessaoCtx);
  if (!s) throw new Error("useSessao fora do SessaoProvider");
  return s;
}

let _sb: ReturnType<typeof createClient> | null = null;
export function sb() {
  if (!_sb) _sb = createClient();
  return _sb;
}

/** Subscreve alterações (turnos, ausências, necessidades) e invalida os dados em cache. */
export function useTempoReal() {
  const qc = useQueryClient();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ping = () => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => qc.invalidateQueries({ queryKey: ["escalas"] }), 400);
    };
    const ch = sb()
      .channel("escalas-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "escala_turnos" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "escala_ausencias" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "escala_necessidades_dia" }, ping)
      .subscribe();
    return () => {
      if (t.current) clearTimeout(t.current);
      sb().removeChannel(ch);
    };
  }, [qc]);
}

/** Dataset + Motor para um intervalo de datas. */
export function useMotor(from: string, to: string, opts: { todasAusencias?: boolean } = {}) {
  const q = useQuery({
    queryKey: ["escalas", "dados", from, to, !!opts.todasAusencias],
    queryFn: () => carregarDataset(sb(), from, to, opts),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const motor = useMemo(() => (q.data ? new Motor(q.data) : null), [q.data]);
  return { motor, ds: q.data ?? null, loading: q.isLoading, error: q.error ? mensagemErro(q.error) : null, fetching: q.isFetching };
}

export interface ErroLote {
  data: string;
  pessoaId: string;
  nome?: string;
  etiqueta?: string;
  motivo: string;
}

export class ErroApi extends Error {
  erros: ErroLote[];
  constructor(msg: string, erros: ErroLote[] = []) {
    super(msg);
    this.erros = erros;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroApi(j.error || `Erro ${res.status}`, j.erros || []);
  return j as T;
}

/** Ações comuns, com invalidação dos dados. */
export function useAcoes() {
  const qc = useQueryClient();
  const sessao = useContext(SessaoCtx);
  const refrescar = useCallback(() => qc.invalidateQueries({ queryKey: ["escalas"] }), [qc]);

  const aplicarTurnos = useCallback(
    async (p: { retirar?: ItemRetirar[]; atribuir?: ItemAtribuir[]; registo?: { acao: string; detalhe: string }; parcial?: boolean }) => {
      const r = await postJson<{ ok: boolean; n: number; excecoes: number; erros?: ErroLote[] }>("/api/escalas/turnos", {
        retirar: p.retirar ?? [],
        atribuir: p.atribuir ?? [],
        registo: p.registo,
        parcial: p.parcial,
      });
      await refrescar();
      return r;
    },
    [refrescar]
  );

  const registar = useCallback(
    async (acao: string, detalhe: string, dados: Record<string, unknown> = {}) => {
      if (!sessao) return;
      await sb().from("escala_registo").insert({ acao, detalhe, dados, user_id: sessao.userId });
    },
    [sessao]
  );

  const conta = useCallback(
    (pessoaId: string, acao: "criar" | "repor", password: string) =>
      postJson<{ ok: boolean; criada?: boolean; ligada?: boolean }>("/api/escalas/contas", { pessoaId, acao, password }),
    []
  );

  return { aplicarTurnos, registar, refrescar, conta };
}

/** Lança se a resposta do Supabase tiver erro, com mensagem legível. */
export function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw new Error(mensagemErro(r.error));
  return r.data;
}
