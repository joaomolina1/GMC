import { redirect } from "next/navigation";
import { getBanners, getViewer } from "@lib/tvibox/server";
import { Banners } from "../_components/Banners";

export const dynamic = "force-dynamic";

export default async function TviBoxHomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/tvibox/entrar");
  const banners = await getBanners(viewer.id);
  return <Banners initialBanners={banners} />;
}
