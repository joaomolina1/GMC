import { redirect } from "next/navigation";
import { createClient } from "@lib/supabase/server";
import { getViewer } from "@lib/tvibox/server";
import { ProfileClient } from "../../_components/ProfileClient";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/tvibox/entrar");

  const [{ count: seen }, { count: following }, { count: unlocked }] = await Promise.all([
    supabase.from("tvibox_progress").select("episode_id", { count: "exact", head: true }).eq("user_id", viewer.id).eq("completed", true),
    supabase.from("tvibox_list").select("series_id", { count: "exact", head: true }).eq("user_id", viewer.id),
    supabase.from("tvibox_unlocks").select("episode_id", { count: "exact", head: true }).eq("user_id", viewer.id),
  ]);

  return (
    <ProfileClient
      stats={{ seen: seen ?? 0, following: following ?? 0, unlocked: unlocked ?? 0 }}
    />
  );
}
