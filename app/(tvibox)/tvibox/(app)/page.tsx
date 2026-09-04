import { redirect } from "next/navigation";
import { getViewer, getFeed } from "@lib/tvibox/server";
import { Feed } from "../_components/Feed";

export const dynamic = "force-dynamic";

export default async function TviBoxFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ ep?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/tvibox/entrar");
  const { ep } = await searchParams;
  const { items } = await getFeed(viewer.id, ep ?? null);
  return <Feed initialItems={items} focusId={ep ?? null} />;
}
