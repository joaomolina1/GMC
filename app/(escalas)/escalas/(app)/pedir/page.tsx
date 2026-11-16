import { exigirPagina } from "../../_lib/guard";
import { Pedir } from "../../_components/Trabalhador";

export default async function Page() {
  await exigirPagina("pessoa");
  return <Pedir />;
}
