import { exigirPagina } from "../../_lib/guard";
import { Pedidos } from "../../_components/Pedidos";

export default async function Page() {
  await exigirPagina("coord");
  return <Pedidos />;
}
