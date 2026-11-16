import { exigirPagina } from "../../_lib/guard";
import { Relatorios } from "../../_components/Analise";

export default async function Page() {
  await exigirPagina("coord");
  return <Relatorios />;
}
