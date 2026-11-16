import { createClient } from "@lib/supabase/server";
import type { Papel, Sessao } from "./tipos";

/** Sessão das Escalas para o utilizador autenticado, ou null se não tiver acesso. */
export async function obterSessao(): Promise<Sessao | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const [profile, pessoa, papel] = await Promise.all([
    sb.from("profiles").select("full_name, email, role, allowed_features").eq("id", user.id).maybeSingle(),
    sb.from("escala_pessoas").select("id, nome, ativo").eq("user_id", user.id).maybeSingle(),
    sb.rpc("escala_papel_atual"),
  ]);
  const p = (papel.data as Papel | null) ?? null;
  if (!p) return null;
  const role = profile.data?.role as string | undefined;
  const adminPlataforma = role === "admin" || role === "super_admin";
  const feats = profile.data?.allowed_features as string[] | null | undefined;
  const ativa = pessoa.data && pessoa.data.ativo !== false ? pessoa.data : null;
  return {
    userId: user.id,
    nome: ativa?.nome || profile.data?.full_name || user.email || "Utilizador",
    email: user.email ?? null,
    papel: p,
    pessoaId: ativa?.id ?? null,
    temPlataforma: adminPlataforma || feats == null || feats.some((f) => f !== "escalas"),
    adminPlataforma,
  };
}
