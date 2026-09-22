/**
 * Cria a equipa de exemplo da escala e a semana de 21–27 set 2026.
 *
 *   npm run escalas:seed
 *
 * Palavra-passe de todas as contas: gmc123
 */
import { buildDemo, DEMO_EQUIPA } from "../../lib/escalas/demo";
import { loadLocalEnv, serviceClient } from "../tvibox/env";

const PASSWORD = "gmc123";

async function ensureUser(email: string, nome: string, id: string): Promise<string> {
  const sb = serviceClient();
  const { data: profile, error: readError } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (profile?.id) {
    const updated = await sb.auth.admin.updateUserById(profile.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nome },
    });
    if (updated.error) throw updated.error;
    const { error } = await sb.from("profiles").update({ full_name: nome }).eq("id", profile.id);
    if (error) throw new Error(error.message);
    return profile.id;
  }

  const created = await sb.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error(`Falhou a criar ${email}`);
  const { error } = await sb.from("profiles").update({ full_name: nome }).eq("id", created.data.user.id);
  if (error) throw new Error(error.message);
  return created.data.user.id;
}

async function main() {
  loadLocalEnv();
  const sb = serviceClient();
  const ids = new Map<string, string>();

  for (const pessoa of DEMO_EQUIPA) {
    const id = await ensureUser(pessoa.email, pessoa.nome, pessoa.userId);
    ids.set(pessoa.userId, id);
    console.log(`${pessoa.papel.padEnd(12)} ${pessoa.email}`);
  }

  const demo = buildDemo();
  const membros = demo.membros.map((m) => ({
    user_id: ids.get(m.userId) ?? m.userId,
    nome: m.nome,
    email: m.email,
    papel: m.papel,
    turnos_permitidos: m.turnosPermitidos,
    ativo: true,
  }));
  const { error: membrosError } = await sb.from("escala_membros").upsert(membros, { onConflict: "user_id" });
  if (membrosError) throw new Error(membrosError.message);

  const userIds = [...ids.values()];
  const { error: delAtrib } = await sb
    .from("escala_assignments")
    .delete()
    .in("user_id", userIds)
    .gte("data", "2026-09-01")
    .lte("data", "2026-10-05");
  if (delAtrib) throw new Error(delAtrib.message);
  const { error: delAus } = await sb
    .from("escala_ausencias")
    .delete()
    .in("user_id", userIds)
    .gte("data", "2026-09-01")
    .lte("data", "2026-10-05");
  if (delAus) throw new Error(delAus.message);

  const rita = ids.get(DEMO_EQUIPA[0].userId);
  const atribuicoes = demo.atribuicoes.map((a) => ({
    user_id: ids.get(a.userId) ?? a.userId,
    data: a.date,
    turno: a.shiftCode,
    excecao: a.excecao,
    excecao_codigos: a.excecao_codigos,
    excecao_justificacao: a.excecao_justificacao,
    excecao_autorizada_por: a.excecao ? rita : null,
    created_by: rita,
  }));
  const { error: atribError } = await sb.from("escala_assignments").insert(atribuicoes);
  if (atribError) throw new Error(atribError.message);

  const ausencias = demo.ausencias.map((a) => ({
    user_id: ids.get(a.userId) ?? a.userId,
    data: a.date,
    tipo: a.tipo,
    estado: a.estado,
    created_by: rita,
  }));
  const { error: ausError } = await sb.from("escala_ausencias").insert(ausencias);
  if (ausError) throw new Error(ausError.message);

  const { error: slotsError } = await sb.from("escala_slots").upsert(
    demo.slots.map((s) => ({ data: s.date, turno: s.shiftCode, quantidade: s.quantidade })),
    { onConflict: "data,turno" }
  );
  if (slotsError) throw new Error(slotsError.message);

  console.log(`\nSemana semeada: ${demo.atribuicoes.length} turnos, ${demo.ausencias.length} férias, ${demo.slots.length} lugares.`);
  console.log("Palavra-passe: gmc123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
