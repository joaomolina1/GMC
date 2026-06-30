import { Suspense } from "react";
import { createClient } from "@lib/supabase/server";
import { DashboardHub } from "@/_components/DashboardHub";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const firstName = (profile?.full_name ?? user?.email ?? "").split(" ")[0] || "Bem-vindo";

  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}>
      <DashboardHub firstName={firstName} />
    </Suspense>
  );
}
