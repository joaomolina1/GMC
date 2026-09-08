import { authorizeLiveAccess } from "@lib/pt26/server";
import { LiveScreen } from "../_components/LiveScreen";
import { Logo } from "../_components/primitives";

export const dynamic = "force-dynamic";

/**
 * Ecrã do pivot (ecrã tátil em estúdio). Sem login: protegido pelo token `?key=` das Definições.
 * Nunca mostra erros técnicos — sem acesso, mostra só o logo e uma nota neutra.
 */
export default async function Pt26LivePage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const params = await searchParams;
  const key = Array.isArray(params.key) ? params.key[0] ?? null : params.key ?? null;

  let allowed = false;
  try {
    allowed = (await authorizeLiveAccess(key)).ok;
  } catch {
    // Sem acesso à BD no servidor: deixamos o cliente tentar (usa a cache local se existir).
    allowed = true;
  }

  if (!allowed) {
    return (
      <>
        <div className="bg" />
        <div className="locked">
          <Logo year="26" />
          <p>Ecrã reservado à emissão. Abre o endereço fornecido pela produção (com a chave de acesso).</p>
        </div>
      </>
    );
  }
  return <LiveScreen mode="live" accessKey={key} />;
}
