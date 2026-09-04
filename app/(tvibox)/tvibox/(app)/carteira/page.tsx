import { redirect } from "next/navigation";
import { getTransactions, getViewer } from "@lib/tvibox/server";
import { WalletClient } from "../../_components/WalletClient";

export const dynamic = "force-dynamic";

export default async function CarteiraPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/tvibox/entrar");
  const transactions = await getTransactions(viewer.id, 12);
  return <WalletClient initialTransactions={transactions} />;
}
