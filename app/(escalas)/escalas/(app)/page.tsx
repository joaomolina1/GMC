import { redirect } from "next/navigation";
import { obterSessao } from "@lib/escalas/sessao";
import { podeCoordenar } from "@lib/escalas/tipos";

export default async function EscalasInicio() {
  const s = await obterSessao();
  if (!s) redirect("/escalas/entrar");
  redirect(podeCoordenar(s.papel) ? "/escalas/grelha" : "/escalas/minha");
}
