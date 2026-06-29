"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Workflow,
  Shield,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@lib/utils";
import { Logo } from "@/_components/Logo";

const navGroups: (
  showAdmin: boolean
) => {
  title?: string;
  items: { href: string; icon: typeof LayoutDashboard; label: string }[];
}[] = (showAdmin) => [
  {
    items: [
      { href: "/", icon: LayoutDashboard, label: "Agentes" },
      { href: "/flows", icon: Workflow, label: "Flows" },
    ],
  },
  ...(showAdmin
    ? [
        {
          title: "Gestão",
          items: [{ href: "/admin", icon: Shield, label: "Backoffice" }],
        },
      ]
    : []),
];

export function Sidebar({
  showAdmin = false,
  collapsed = false,
  onToggle,
}: {
  showAdmin?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-line px-3",
          collapsed ? "justify-center" : "justify-between px-4"
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          {collapsed ? (
            <Logo variant="mark" size="md" />
          ) : (
            <Logo variant="full" size="md" />
          )}
        </Link>
        {!collapsed && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Minimizar barra lateral"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {collapsed && onToggle && (
        <div className="flex justify-center border-b border-line py-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Expandir barra lateral"
          >
            <PanelLeftOpen size={18} />
          </button>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        {navGroups(showAdmin).map((group, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {group.title && !collapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                    collapsed ? "justify-center" : "",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />
                  )}
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div
          className={cn(
            "flex items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 p-3 text-white",
            collapsed ? "justify-center" : "gap-3"
          )}
        >
          <Sparkles size={18} className="shrink-0" />
          {!collapsed && (
            <div>
              <p className="text-xs font-semibold">Plataforma IA</p>
              <p className="text-[11px] text-white/80">Fase 6 · GMC</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
