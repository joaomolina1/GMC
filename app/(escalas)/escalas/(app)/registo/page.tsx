import { exigirPagina } from "../../_lib/guard";
import { Registo } from "../../_components/Registo";

export default async function Page() {
  await exigirPagina("coord");
  return <Registo />;
}
