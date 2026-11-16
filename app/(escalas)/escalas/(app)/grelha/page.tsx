import { exigirPagina } from "../../_lib/guard";
import { Grelha } from "../../_components/Grelha";

export default async function Page() {
  await exigirPagina("coord");
  return <Grelha />;
}
