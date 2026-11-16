import { redirect } from "next/navigation";
import { obterSessao } from "@lib/escalas/sessao";
import { podeCoordenar } from "@lib/escalas/tipos";

/** Proteção das páginas: coordenação, ou área pessoal (precisa de ficha associada). */
export async function exigirPagina(nivel: "coord" | "pessoa") {
  const s = await obterSessao();
  if (!s) redirect("/escalas/entrar");
  if (nivel === "coord" && !podeCoordenar(s.papel)) redirect("/escalas");
  if (nivel === "pessoa" && !s.pessoaId) redirect("/escalas");
  return s;
}
