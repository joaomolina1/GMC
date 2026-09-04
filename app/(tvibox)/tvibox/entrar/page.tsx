import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@lib/supabase/env";
import { createClient } from "@lib/supabase/server";
import { SERIES } from "@lib/tvibox/catalog";
import { posterPublicUrl } from "@lib/tvibox/media";
import { EntrarClient } from "../_components/EntrarClient";

export const dynamic = "force-dynamic";

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/tvibox") ? next : "/tvibox";
  if (user) redirect(safeNext);

  const { url } = getSupabaseEnv();
  const posters = SERIES.map((s) => ({ slug: s.slug, title: s.title, url: posterPublicUrl(url, s.slug), palette: s.palette }));

  return <EntrarClient posters={posters} next={safeNext} />;
}
