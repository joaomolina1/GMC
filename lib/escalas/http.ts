import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@lib/supabase/server";
import type { HardCode } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const dateSchema = z.string().regex(ISO_DATE, "data AAAA-MM-DD");

export const atribuicaoSchema = z.object({
  userId: z.string().uuid(),
  date: dateSchema,
  shiftCode: z.string().trim().min(1).max(8),
  override: z.boolean().optional(),
  justificacao: z.string().max(2000).optional(),
  substituir: z.boolean().optional(),
});

export const loteSchema = z.object({
  atribuicoes: z.array(z.object({
    userId: z.string().uuid(),
    date: dateSchema,
    shiftCode: z.string().trim().min(1).max(8),
  })).min(1).max(200),
  justificacao: z.string().max(2000).optional(),
});

export const sugerirSchema = z.object({
  from: dateSchema,
  to: dateSchema,
});

export const settingsSchema = z
  .object({
    maxDiasConsecutivos: z.number().int().min(1).max(14),
    folgasMinimasPor14Dias: z.number().int().min(0).max(14),
    janelaFolgasDias: z.number().int().min(7).max(28),
    descansoMinimoHoras: z.number().min(0).max(24),
    duracaoPadraoTurnoHoras: z.number().min(1).max(12),
    maxHorasSemanais: z.number().min(1).max(84),
    preferirFolgasAgrupadas: z.boolean(),
  })
  .refine((s) => s.folgasMinimasPor14Dias <= s.janelaFolgasDias, {
    message: "as folgas mínimas não podem exceder a janela",
    path: ["folgasMinimasPor14Dias"],
  });

export const ausenciaSchema = z.object({
  userId: z.string().uuid(),
  date: dateSchema,
  tipo: z.enum(["ferias", "ausencia"]),
});

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function readJson<T>(req: Request, schema: z.ZodSchema<T>): Promise<T | NextResponse> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
  }
  return parsed.data;
}

export async function requireEscala(gestao = false) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("Unauthorized", 401) };

  const { data: profile } = await supabase.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle();
  const admin = profile?.role === "admin" || profile?.role === "super_admin";
  const { data: membro, error } = await supabase
    .from("escala_membros")
    .select("papel, ativo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { error: jsonError(error.message, 500) };

  const podeLer = admin || Boolean(membro?.ativo);
  const podeGerir = admin || (membro?.ativo && membro.papel === "coordenador");
  if (!podeLer) return { error: jsonError("A escala está reservada à redação.", 403) };
  if (gestao && !podeGerir) return { error: jsonError("Só um coordenador pode alterar a escala.", 403) };

  return {
    supabase,
    user,
    podeGerir: Boolean(podeGerir),
    nome: (profile?.full_name as string | null) ?? null,
    email: (profile?.email as string | null) ?? user.email ?? null,
  };
}

const HARD_CODES = new Set<HardCode>(["FORA_DO_PERFIL", "AUSENCIA_APROVADA", "TURNO_DUPLICADO"]);

export function respostaDb(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno";
  const match = message.match(/ESCALA_HARD:([A-Z_]+):\s*(.*)/);
  if (match && HARD_CODES.has(match[1] as HardCode)) {
    return NextResponse.json(
      {
        ok: false,
        hard: [
          {
            code: match[1],
            severity: "HARD",
            userId: "",
            date: "",
            message: match[2] || match[1],
            detail: message,
          },
        ],
        warnings: [],
      },
      { status: 422 }
    );
  }
  if (/duplicate key|escala_assignments_user_id_data/i.test(message)) {
    return NextResponse.json(
      {
        ok: false,
        hard: [
          {
            code: "TURNO_DUPLICADO",
            severity: "HARD",
            userId: "",
            date: "",
            message: "Já tem um turno neste dia",
            detail: "Só pode haver um turno por dia.",
          },
        ],
        warnings: [],
      },
      { status: 422 }
    );
  }
  console.error("[escalas]", message);
  return jsonError(message, 500);
}
