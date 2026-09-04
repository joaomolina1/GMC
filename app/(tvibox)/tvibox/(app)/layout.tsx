import { redirect } from "next/navigation";
import { createClient } from "@lib/supabase/server";
import { getViewer, getWallet } from "@lib/tvibox/server";
import { Shell } from "../_components/Shell";

export const dynamic = "force-dynamic";

export default async function TviBoxAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/tvibox/entrar");
  const wallet = await getWallet(supabase);

  return (
    <Shell viewer={viewer} wallet={wallet}>
      {children}
    </Shell>
  );
}
