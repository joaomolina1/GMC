import { Sidebar } from "@/_components/Sidebar";
import { TopBar } from "@/_components/TopBar";
import { getProfile } from "@lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          user={
            profile
              ? {
                  full_name: profile.full_name,
                  email: profile.email,
                  avatar_url: profile.avatar_url,
                  role: profile.role,
                }
              : undefined
          }
        />
        <main className="flex-1 overflow-auto px-5 py-6 sm:px-7 sm:py-8">
          <div className="mx-auto max-w-7xl animate-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
