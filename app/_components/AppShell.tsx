import { AppShellClient } from "@/_components/AppShellClient";
import { getProfile } from "@lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const showAdmin =
    profile?.role === "admin" || profile?.role === "super_admin";

  return (
    <AppShellClient
      showAdmin={showAdmin}
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
    >
      {children}
    </AppShellClient>
  );
}
