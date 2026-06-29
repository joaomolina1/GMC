"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Bell, ChevronDown, Settings } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Avatar } from "@/_design_system/Avatar";

interface TopBarProps {
  user?: { full_name?: string | null; email?: string; avatar_url?: string | null; role?: string };
}

const TITLES: { match: (p: string) => boolean; title: string; subtitle: string }[] = [
  { match: (p) => p === "/", title: "Página inicial", subtitle: "Visão geral da sua plataforma de agentes" },
  { match: (p) => p.startsWith("/agents/new"), title: "Novo agente", subtitle: "Configure um novo agente de IA" },
  { match: (p) => /\/agents\/[^/]+\/chat/.test(p), title: "Conversa", subtitle: "Teste o seu agente em tempo real" },
  { match: (p) => /\/agents\/[^/]+/.test(p), title: "Agent Builder", subtitle: "Configure prompt, tools, skills e knowledge" },
  { match: (p) => p.startsWith("/agents"), title: "Agentes", subtitle: "Gerir e configurar agentes de IA" },
  { match: (p) => p.startsWith("/marketplace"), title: "Marketplace", subtitle: "Descubra agentes e skills" },
  { match: (p) => p.startsWith("/flows"), title: "Flows", subtitle: "Orquestração visual de agentes" },
  { match: (p) => p.startsWith("/admin"), title: "Backoffice", subtitle: "Administração e métricas" },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  editor: "Editor",
  user: "Utilizador",
};

export function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const meta = TITLES.find((t) => t.match(pathname)) ?? {
    title: "GMC",
    subtitle: "Grupo Media Capital",
  };

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = user?.full_name ?? user?.email ?? "Utilizador";
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : null;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-5 sm:px-7">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-slate-900">{meta.title}</h1>
        <p className="hidden truncate text-sm text-slate-500 sm:block">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          className="relative flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl text-slate-400"
          title="Notificações — em breve"
          type="button"
          disabled
          aria-label="Notificações (em breve)"
        >
          <Bell size={19} />
        </button>

        <div className="hidden h-8 w-px bg-line sm:block" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-slate-100"
            type="button"
          >
            <Avatar name={displayName} src={user?.avatar_url} />
            <div className="hidden text-left sm:block">
              <p className="max-w-[160px] truncate text-sm font-medium text-slate-800">{displayName}</p>
              {roleLabel && <p className="text-xs text-slate-400">{roleLabel}</p>}
            </div>
            <ChevronDown size={16} className="hidden text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right animate-fade-in rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-card-hover)]">
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
                {user?.email && <p className="truncate text-xs text-slate-400">{user.email}</p>}
              </div>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Settings size={16} />
                  Backoffice
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                type="button"
              >
                <LogOut size={16} />
                Terminar sessão
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
