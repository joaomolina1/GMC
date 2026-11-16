import { exigirPagina } from "../../_lib/guard";
import { Conformidade } from "../../_components/Analise";

export default async function Page() {
  await exigirPagina("coord");
  return <Conformidade />;
}
