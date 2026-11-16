import type { Metadata } from "next";
import { obterSessao } from "@lib/escalas/sessao";
import { SessaoProvider } from "../_lib/contexto";
import { Shell } from "../_components/Shell";
import { DialogoProvider } from "../_components/ui";
import { SemAcessoEscalas } from "../_components/SemAcesso";
import { GuardaProvider } from "../_lib/guarda";

export const metadata: Metadata = { title: "Escalas · GMC" };
export const dynamic = "force-dynamic";

export default async function EscalasLayout({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) return <SemAcessoEscalas />;
  return (
    <SessaoProvider sessao={sessao}>
      <DialogoProvider>
        <GuardaProvider>
          <Shell>{children}</Shell>
        </GuardaProvider>
      </DialogoProvider>
    </SessaoProvider>
  );
}
