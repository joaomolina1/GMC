import { exigirPagina } from "../../_lib/guard";
import { Minha } from "../../_components/Trabalhador";

export default async function Page() {
  await exigirPagina("pessoa");
  return <Minha />;
}
