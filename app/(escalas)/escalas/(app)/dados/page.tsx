import { exigirPagina } from "../../_lib/guard";
import { Dados } from "../../_components/Dados";

export default async function Page() {
  await exigirPagina("coord");
  return <Dados />;
}
