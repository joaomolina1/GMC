import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigir } from "@lib/escalas/api";
import { mensagemErro } from "@lib/escalas/dados";
import { tryCreateServiceClient } from "@lib/supabase/server";

const Body = z.object({
  pessoaId: z.string().uuid(),
  acao: z.enum(["criar", "repor"]),
  password: z.string().min(8, "A palavra-passe temporária tem de ter pelo menos 8 caracteres.").max(72),
});

/**
 * Contas de acesso das pessoas da escala (email + palavra-passe).
 * - criar: cria a conta (só Escalas) com palavra-passe temporária, ou liga uma conta já existente.
 * - repor: define nova palavra-passe temporária.
 * Em ambos os casos a pessoa tem de a mudar no próximo acesso.
 * A coordenação só gere contas de trabalhadores que usam apenas as Escalas; a administração gere todas.
 */
export async function POST(req: Request) {
  const auth = await exigir("coord");
  if ("erro" in auth) return auth.erro;
  const { sb, sessao } = auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return erro(parsed.error.issues[0]?.message ?? "Pedido inválido.");
  const { pessoaId, acao, password } = parsed.data;

  const { data: pessoa, error: pe } = await sb
    .from("escala_pessoas")
    .select("id, nome, email, papel, user_id, ativo")
    .eq("id", pessoaId)
    .maybeSingle();
  if (pe) return erro(mensagemErro(pe), 500);
  if (!pessoa) return erro("Pessoa não encontrada.", 404);
  if (!pessoa.email) return erro("A pessoa não tem email: registe-o na ficha primeiro.");

  const admin = sessao.papel === "ADMINISTRADOR";
  if (!admin && pessoa.papel !== "TRABALHADOR") return erro("Só a administração gere contas da coordenação.", 403);

  const service = await tryCreateServiceClient();
  if (!service) return erro("O servidor não tem a chave de serviço do Supabase configurada.", 500);

  let userId = pessoa.user_id as string | null;
  let criada = false;

  if (acao === "criar") {
    if (userId) return erro("Esta pessoa já tem conta. Use “Repor palavra-passe”.", 409);
    const { data: existente } = await service.from("profiles").select("id").ilike("email", pessoa.email).maybeSingle();
    if (existente) {
      // Conta da plataforma já existente: só liga, não mexe na palavra-passe nem nos acessos.
      await service.from("escala_pessoas").update({ user_id: existente.id }).eq("id", pessoaId);
      await sb.from("escala_registo").insert({
        acao: "Conta ligada",
        detalhe: `${pessoa.nome} · conta já existente na plataforma`,
        user_id: sessao.userId,
      });
      return NextResponse.json({ ok: true, ligada: true });
    }
    const { data: novo, error: ce } = await service.auth.admin.createUser({
      email: pessoa.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: pessoa.nome },
    });
    if (ce || !novo.user) return erro(ce?.message ?? "Não foi possível criar a conta.", 500);
    userId = novo.user.id;
    criada = true;
    // Conta nova: só vê as Escalas.
    const { error: fe } = await service.from("profiles").update({ allowed_features: ["escalas"] }).eq("id", userId);
    if (fe) return erro(fe.message, 500);
  } else {
    if (!userId) return erro("Esta pessoa ainda não tem conta.", 409);
    const { data: prof } = await service.from("profiles").select("role, allowed_features").eq("id", userId).maybeSingle();
    const soEscalas = Array.isArray(prof?.allowed_features) && prof.allowed_features.length === 1 && prof.allowed_features[0] === "escalas";
    const adminConta = prof?.role === "admin" || prof?.role === "super_admin";
    if (adminConta || (!soEscalas && !sessao.adminPlataforma)) {
      return erro("Esta conta também dá acesso a outras zonas da plataforma: a palavra-passe é gerida no backoffice da plataforma.", 403);
    }
    const { error: ue } = await service.auth.admin.updateUserById(userId, { password });
    if (ue) return erro(ue.message, 500);
  }

  const { error: me } = await service.rpc("conta_marcar_password_temporaria", { p_user_id: userId });
  if (me) return erro(me.message, 500);

  await sb.from("escala_registo").insert({
    acao: criada ? "Conta criada" : "Palavra-passe reposta",
    detalhe: `${pessoa.nome} · palavra-passe temporária (mudança obrigatória no próximo acesso)`,
    user_id: sessao.userId,
  });
  return NextResponse.json({ ok: true, criada });
}
