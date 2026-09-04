/** Public Supabase project URL for the GMC prototype. */
export const SUPABASE_PROJECT_URL =
  "https://wnhojvxnamxmpmdislcl.supabase.co";

/**
 * Devolve o primeiro candidato que seja um URL http(s) válido; caso contrário o
 * URL do projeto. Protege contra segredos mal copiados (ex.: "https" sem "://").
 */
export function resolveSupabaseUrl(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    const v = c?.trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "http:" || u.protocol === "https:") return v.replace(/\/$/, "");
    } catch {
      /* candidato inválido — tenta o próximo */
    }
  }
  return SUPABASE_PROJECT_URL;
}

/**
 * Legacy anon JWT for the dedicated prototype project.
 * Public by design — RLS enforces access control. Override via env in production.
 */
export const SUPABASE_ANON_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduaG9qdnhuYW14bXBtZGlzbGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzMxNTksImV4cCI6MjA5ODI0OTE1OX0.xp1l-RwHK71oby9mY8ixhNxg5h1z-zkFOBoRcZyFf2Q";
