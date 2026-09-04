import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const seriesSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(2).max(40).regex(SLUG_RE, "slug: só minúsculas, números e hífens"),
  title: z.string().trim().min(1).max(80),
  genre: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(60).nullable().optional(),
  synopsis: z.string().trim().max(600).nullable().optional(),
  badge: z.enum(["hot", "new"]).nullable().optional(),
  palette: z.object({ from: z.string().regex(/^#[0-9a-fA-F]{6}$/), to: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
  poster_url: z.string().url().nullable().optional(),
  total_episodes: z.number().int().min(1).max(500),
  sort_order: z.number().int().min(0).max(9999),
  cast_notes: z.array(z.object({ name: z.string(), age: z.number().optional(), look: z.string().optional(), role: z.string() })).optional(),
});

export const episodeSchema = z.object({
  id: z.string().uuid().optional(),
  series_id: z.string().uuid(),
  number: z.number().int().min(1).max(999),
  title: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().max(600).nullable().optional(),
  hook_title: z.string().trim().max(80).nullable().optional(),
  hook_text: z.string().trim().max(300).nullable().optional(),
  is_free: z.boolean(),
  coin_cost: z.number().int().min(0).max(999),
  status: z.enum(["draft", "published", "coming_soon"]),
  video_url: z.string().url().nullable().optional(),
  duration_seconds: z.number().int().min(1).max(3600).nullable().optional(),
  poster_url: z.string().url().nullable().optional(),
  subtitles_url: z.string().url().nullable().optional(),
  render_kind: z.enum(["none", "animatic", "final"]).optional(),
});

type RequireAdminResult = Awaited<ReturnType<typeof requireAdmin>>;
export type AdminContext = Extract<RequireAdminResult, { supabase: unknown }>;

/** Autentica como admin e trata erros de forma uniforme. */
export async function withAdmin(handler: (ctx: AdminContext) => Promise<Response>): Promise<Response> {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  try {
    return await handler(auth as AdminContext);
  } catch (e) {
    console.error("[tvibox/admin]", e);
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

export async function readJson<T>(req: Request, schema: z.ZodSchema<T>): Promise<T | NextResponse> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 422 }
    );
  }
  return parsed.data;
}
