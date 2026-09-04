import { notFound, redirect } from "next/navigation";
import { getPlaylist, getViewer } from "@lib/tvibox/server";
import { Player } from "../../../_components/Player";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/tvibox/entrar");
  const [{ slug }, { ep }] = await Promise.all([params, searchParams]);
  const playlist = await getPlaylist(viewer.id, slug);
  if (!playlist) notFound();

  const requested = Number(ep);
  const startNumber =
    Number.isInteger(requested) && playlist.items.some((i) => i.episode.number === requested)
      ? requested
      : playlist.startNumber;

  return <Player series={playlist.series} initialItems={playlist.items} startNumber={startNumber} />;
}
