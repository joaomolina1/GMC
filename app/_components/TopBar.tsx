"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Avatar } from "@/_design_system/Avatar";

interface TopBarProps {
  title: string;
  subtitle?: string;
  user?: { full_name?: string | null; email?: string; avatar_url?: string | null };
}

export function TopBar({ title, subtitle, user }: TopBarProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2">
            <Avatar name={user.full_name ?? user.email ?? "U"} src={user.avatar_url} />
            <span className="text-sm text-gray-700">{user.full_name ?? user.email}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          title="Terminar sessão"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
