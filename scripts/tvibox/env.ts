import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseUrl } from "../../lib/supabase/constants";

/** Carrega .env.local quando existe (execução local); no CI/Cloud as variáveis já vêm do ambiente. */
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile?.(file);
    } catch {
      /* ficheiro ausente */
    }
  }
}

export function supabaseUrl(): string {
  return resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
}

/** Cliente com chave de serviço — só para scripts de produção/seed (nunca no browser). */
export function serviceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Define SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY");
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

export function log(msg: string, ...rest: unknown[]): void {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`, ...rest);
}
