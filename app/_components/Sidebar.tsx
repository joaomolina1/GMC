"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Store,
  Workflow,
  Shield,
} from "lucide-react";
import { cn } from "@lib/utils";
import { Logo } from "@/_components/Logo";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/agents", icon: Bot, label: "Agentes" },
  { href: "/marketplace", icon: Store, label: "Marketplace" },
  { href: "/flows", icon: Workflow, label: "Flows" },
  { href: "/admin", icon: Shield, label: "Admin" },
  { href: "/settings", icon: Settings, label: "Definições" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-16 flex-col items-center border-r border-gray-200 bg-white py-4">
      <Link href="/" className="mb-8">
        <Logo size="sm" />
      </Link>
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-[#0066B3] text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon size={20} />
            </Link>
          );
        })}
      </nav>
      <Link
        href="/agents"
        title="Chat"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
      >
        <MessageSquare size={20} />
      </Link>
    </aside>
  );
}
