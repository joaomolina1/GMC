import { Sidebar } from "@/_components/Sidebar";
import { TopBar } from "@/_components/TopBar";
import { getProfile } from "@lib/supabase/server";

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Marketplace" user={profile ?? undefined} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
