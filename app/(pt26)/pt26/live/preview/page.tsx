import { redirect } from "next/navigation";
import { getProfile } from "@lib/supabase/server";
import { LiveScreen } from "../../_components/LiveScreen";

export const dynamic = "force-dynamic";

/** Igual ao ecrã do pivot mas inclui semanas em rascunho — para a produção validar antes de publicar. */
export default async function Pt26PreviewPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!["admin", "super_admin"].includes(profile.role)) redirect("/");
  return <LiveScreen mode="preview" accessKey={null} />;
}
