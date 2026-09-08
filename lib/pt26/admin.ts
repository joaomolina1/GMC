import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";
import { PERSON_KINDS } from "./types";

type RequireAdminResult = Awaited<ReturnType<typeof requireAdmin>>;
export type AdminContext = Extract<RequireAdminResult, { supabase: unknown }>;

/** Autentica como admin (profiles.role admin|super_admin) e uniformiza erros. */
export async function withAdmin(handler: (ctx: AdminContext) => Promise<Response>): Promise<Response> {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  try {
    return await handler(auth as AdminContext);
  } catch (e) {
    console.error("[pt26/admin]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 });
  }
}

export async function audit(ctx: AdminContext, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  try {
    await logAudit(ctx.supabase, { actorId: ctx.user.id, action, entityType, entityId, metadata });
  } catch {
    /* auditoria nunca bloqueia a operação */
  }
}

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
  return parseWith(schema, raw);
}

export function parseWith<T>(schema: z.ZodSchema<T>, raw: unknown): T | NextResponse {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), 422);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ schemas */

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const trimmed = (max: number) => z.string().trim().max(max);

export const partySchema = z.object({
  id: z.string().uuid().optional(),
  acronym: trimmed(20).min(1),
  name: trimmed(120).min(1),
  color: z.string().regex(HEX_COLOR, "cor em hexadecimal (#rrggbb)"),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export const personSchema = z.object({
  id: z.string().uuid().optional(),
  name: trimmed(120).min(1),
  role: trimmed(160).nullable().optional(),
  kind: z.enum(PERSON_KINDS as [string, ...string[]]).default("OTHER"),
  party_id: z.string().uuid().nullable().optional(),
  aliases: z.array(trimmed(120)).max(20).default([]),
});

export const aliasSchema = z.object({
  person_id: z.string().uuid(),
  alias: trimmed(120).min(1),
});

export const questionPatchSchema = z.object({
  id: z.string().uuid(),
  title: trimmed(160).min(1),
  subtitle: trimmed(200).nullable().optional(),
});

export const settingsPatchSchema = z.object({
  live_token: trimmed(120).nullable().optional(),
  footer_text: trimmed(300).nullable().optional(),
  logo_year: trimmed(4).min(1).optional(),
  regenerate_token: z.boolean().optional(),
});

export const publishSchema = z.object({ published: z.boolean() });

export const weekPatchSchema = z.object({
  label: trimmed(60).min(1).optional(),
  date: z.string().regex(ISO_DATE).optional(),
});

export const resultInputSchema = z.object({
  item_key: trimmed(120).min(1),
  value: z.number().finite(),
  person_id: z.string().uuid().nullable().optional(),
  party_id: z.string().uuid().nullable().optional(),
});

export const quadroInputSchema = z.object({
  question_number: z.number().int().min(1).max(8),
  idx: z.number().int().min(1).max(50),
  title: trimmed(120).nullable().optional(),
  person_id: z.string().uuid().nullable().optional(),
  results: z.array(resultInputSchema).max(60),
});

export const weekSaveSchema = z.object({
  label: trimmed(60).min(1).optional(),
  quadros: z.array(quadroInputSchema).max(120),
});

export const commitSchema = z.object({ preview_id: z.string().uuid() });
