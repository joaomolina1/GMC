import { exigirPagina } from "../../_lib/guard";
import { Configuracao } from "../../_components/Configuracao";

export default async function Page() {
  await exigirPagina("coord");
  return <Configuracao />;
}
