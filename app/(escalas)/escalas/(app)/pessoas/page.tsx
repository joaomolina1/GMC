import { exigirPagina } from "../../_lib/guard";
import { Pessoas } from "../../_components/Pessoas";

export default async function Page() {
  await exigirPagina("coord");
  return <Pessoas />;
}
