"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  FileSpreadsheet,
  History,
  Inbox,
  KeyRound,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@lib/utils";
import { PAPEL_LABEL, podeCoordenar } from "@lib/escalas/tipos";
import { sb, useSessao, useTempoReal } from "../_lib/contexto";
import { initials } from "./ui";

type Item = { href: string; label: string; icon: typeof Inbox; badge?: number };

export const PAGINAS: Record<string, [string, string]> = {
  grelha: ["Grelha semanal", "Distribuição de turnos por grupo e por slot"],
  pedidos: ["Pedidos", "Ausências, férias e baixas a aguardar decisão"],
  pessoas: ["Pessoas", "Equipa, perfis de horário, particularidades e contas"],
  conformidade: ["Conformidade", "Descanso, folgas de compensação e rotação"],
  relatorios: ["Relatórios", "Horas e turnos por pessoa"],
  configuracao: ["Configuração", "Regras, slots, grupos, necessidades e feriados"],
  registo: ["Registo", "Histórico de alterações"],
  dados: ["Excel", "Exportar e importar dados"],
  minha: ["A minha escala", "Os seus turnos, férias e folgas"],
  pedir: ["Pedir ausência", "Indisponibilidade, baixa médica ou férias"],
  "meus-pedidos": ["Os meus pedidos", "Estado dos pedidos submetidos"],
};

export function Shell({ children }: { children: React.ReactNode }) {
  const sessao = useSessao();
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const coord = podeCoordenar(sessao.papel);
  useTempoReal();

  const { data: pendentes = 0 } = useQuery({
    queryKey: ["escalas", "pendentes"],
    enabled: coord,
    queryFn: async () => {
      const { count } = await sb().from("escala_ausencias").select("id", { count: "exact", head: true }).eq("estado", "PENDENTE");
      return count ?? 0;
    },
  });

  useEffect(() => {
    const f = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  useEffect(() => setAberto(false), [pathname]);

  const seccoes: { titulo: string; itens: Item[] }[] = [];
  if (coord) {
    seccoes.push({
      titulo: "Coordenação",
      itens: [
        { href: "/escalas/grelha", label: "Grelha semanal", icon: LayoutGrid },
        { href: "/escalas/pedidos", label: "Pedidos", icon: Inbox, badge: pendentes },
        { href: "/escalas/pessoas", label: "Pessoas", icon: Users },
        { href: "/escalas/conformidade", label: "Conformidade", icon: ShieldCheck },
        { href: "/escalas/relatorios", label: "Relatórios", icon: BarChart3 },
      ],
    });
    seccoes.push({
      titulo: "Gestão",
      itens: [
        { href: "/escalas/configuracao", label: "Configuração", icon: Settings },
        { href: "/escalas/registo", label: "Registo", icon: History },
        { href: "/escalas/dados", label: "Excel", icon: FileSpreadsheet },
      ],
    });
  }
  if (sessao.pessoaId) {
    seccoes.push({
      titulo: "A minha área",
      itens: [
        { href: "/escalas/minha", label: "A minha escala", icon: CalendarDays },
        { href: "/escalas/pedir", label: "Pedir ausência", icon: CalendarPlus },
        { href: "/escalas/meus-pedidos", label: "Os meus pedidos", icon: ListChecks },
      ],
    });
  }

  const chave = pathname.split("/")[2] ?? "";
  const [titulo, sub] = PAGINAS[chave] ?? ["Escalas", ""];
  useEffect(() => {
    document.title = `${titulo} · Escalas`;
  }, [titulo]);

  async function sair() {
    await sb().auth.signOut();
    router.replace("/escalas/entrar");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {aberto && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-slate-950/40 md:hidden" onClick={() => setAberto(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform md:static md:translate-x-0",
          aberto ? "translate-x-0 shadow-xl" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <CalendarDays size={18} />
          </div>
          <div className="flex-1 leading-tight">
            <div className="text-sm font-semibold text-slate-900">Escalas</div>
            <div className="text-[11px] text-slate-400">Grupo Media Capital</div>
          </div>
          <button type="button" className="rounded-lg p-1 text-slate-400 md:hidden" onClick={() => setAberto(false)} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
          {seccoes.map((s) => (
            <div key={s.titulo} className="flex flex-col gap-0.5">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.titulo}</p>
              {s.itens.map(({ href, label, icon: Icon, badge }) => {
                const ativo = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                      ativo ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {ativo && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                    <Icon size={18} className="shrink-0" />
                    <span className="flex-1">{label}</span>
                    {!!badge && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {sessao.temPlataforma && (
          <div className="border-t border-line p-3">
            <Link href="/" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900">
              <LayoutGrid size={18} /> Plataforma GMC
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur sm:px-6">
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{titulo}</h1>
            {sub && <p className="hidden truncate text-xs text-slate-500 sm:block">{sub}</p>}
          </div>
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials(sessao.nome)}</div>
              <span className="hidden max-w-[160px] truncate text-sm font-medium text-slate-700 sm:block">{sessao.nome}</span>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
            {menu && (
              <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
                <div className="border-b border-line px-4 py-3">
                  <div className="truncate text-sm font-medium text-slate-900">{sessao.nome}</div>
                  <div className="truncate text-xs text-slate-500">{sessao.email}</div>
                  <div className="mt-1 text-xs text-brand-700">{PAPEL_LABEL[sessao.papel]}</div>
                </div>
                <Link href="/conta/password?app=escalas" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <KeyRound size={16} /> Mudar palavra-passe
                </Link>
                <button type="button" onClick={sair} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <LogOut size={16} /> Terminar sessão
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-[92rem] animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
