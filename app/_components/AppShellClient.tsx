"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/_components/Sidebar";
import { TopBar } from "@/_components/TopBar";

interface ShellUser {
  full_name?: string | null;
  email?: string;
  avatar_url?: string | null;
  role?: string;
}

const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
} | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within AppShellClient");
  return ctx;
}

export function AppShellClient({
  user,
  showAdmin,
  children,
}: {
  user?: ShellUser;
  showAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const isFlowEditor = /^\/flows\/[^/]+$/.test(pathname);
  const isAgentEditor = /^\/agents\/[^/]+$/.test(pathname);

  useEffect(() => {
    const stored = localStorage.getItem("gmc-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("gmc-sidebar-collapsed", String(collapsed));
  }, [collapsed, hydrated]);

  const toggle = () => setCollapsed((c) => !c);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      <div className="flex h-screen overflow-hidden bg-canvas">
        {mobileNavigationOpen && (
          <button
            type="button"
            aria-label="Fechar navegação"
            className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
            onClick={() => setMobileNavigationOpen(false)}
          />
        )}
        <Sidebar
          showAdmin={showAdmin}
          collapsed={mobileNavigationOpen ? false : collapsed}
          onToggle={toggle}
          mobileOpen={mobileNavigationOpen}
          onNavigate={() => setMobileNavigationOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar user={user} onOpenNavigation={() => setMobileNavigationOpen(true)} />
          <main
            className={
              isFlowEditor || isAgentEditor
                ? "relative z-0 flex flex-1 flex-col overflow-hidden"
                : "relative z-0 flex-1 overflow-auto px-5 py-6 sm:px-7 sm:py-8"
            }
          >
            {isFlowEditor || isAgentEditor ? (
              children
            ) : (
              <div className="mx-auto max-w-7xl">{children}</div>
            )}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
