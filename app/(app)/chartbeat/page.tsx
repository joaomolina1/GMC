import { getProfile } from "@lib/supabase/server";
import { ChartbeatDashboard } from "./_components/ChartbeatDashboard";

export const dynamic = "force-dynamic";

export default async function ChartbeatPage() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  return <ChartbeatDashboard isAdmin={Boolean(isAdmin)} />;
}
