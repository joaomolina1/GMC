import { exigirPagina } from "../../_lib/guard";
import { MeusPedidos } from "../../_components/Trabalhador";

export default async function Page() {
  await exigirPagina("pessoa");
  return <MeusPedidos />;
}
