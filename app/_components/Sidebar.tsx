"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  Store,
  Workflow,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@lib/utils";
import { Logo } from "@/_components/Logo";

const navGroups: {
  title?: string;
  items: { href: string; icon: typeof Bot; label: string }[];
}[] = [
  {
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/agents", icon: Bot, label: "Agentes" },
    ],
  },
  {
    title: "Explorar",
    items: [
      { href: "/marketplace", icon: Store, label: "Marketplace" },
      { href: "/flows", icon: Workflow, label: "Flows" },
    ],
  },
  {
    title: "Gestão",
    items: [{ href: "/admin", icon: Shield, label: "Backoffice" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[72px] flex-col border-r border-line bg-surface transition-all lg:w-64">
      <div className="flex h-16 items-center justify-center border-b border-line px-4 lg:justify-start">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo variant="mark" size="md" className="lg:hidden" />
          <span className="hidden lg:block">
            <Logo variant="full" size="md" />
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {navGroups.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.title && (
              <p className="mb-1 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, icon: Icon, label }) => {
              const active =
                pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    "justify-center lg:justify-start",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />
                  )}
                  <Icon size={20} className="shrink-0" />
                  <span className="hidden lg:block">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 p-3 text-white">
          <Sparkles size={18} className="shrink-0" />
          <div className="hidden lg:block">
            <p className="text-xs font-semibold">Plataforma IA</p>
            <p className="text-[11px] text-white/80">Fase 1 · GMC</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
