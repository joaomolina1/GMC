import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { createClient } from "@lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface TviboxRequestContext {
  supabase: Supabase;
  userId: string;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Autentica o pedido com a sessão Supabase (cookies). */
export async function withUser(
  handler: (ctx: TviboxRequestContext) => Promise<Response>
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sessão expirada — inicia sessão de novo", 401);
  try {
    return await handler({ supabase, userId: user.id });
  } catch (e) {
    console.error("[tvibox/api]", e);
    return fail(e instanceof Error ? e.message : "Erro interno", 500);
  }
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | Response> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "), 422);
  return parsed.data;
}

/** Chama uma função SQL que devolve JSONB {ok, ...}. */
export async function rpcJson(
  supabase: Supabase,
  fn: string,
  args?: Record<string, unknown>
): Promise<Response> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fail(error.message, 500);
  // Resultados de negócio (ex.: moedas insuficientes) vêm com ok:false e HTTP 200;
  // códigos de erro HTTP ficam reservados a falhas técnicas.
  return json(data ?? { ok: false, error: "empty" }, 200);
}
