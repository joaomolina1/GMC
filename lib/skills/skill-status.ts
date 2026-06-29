import { getVoyageProvider } from "@lib/ai/providers/voyage";

export type SkillReadiness = "ready" | "degraded" | "unavailable";

export interface SkillStatus {
  key: string;
  readiness: SkillReadiness;
  requirement?: string;
  note: string;
}

function envReady(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

/** Server-side readiness for each runtime skill (env + platform constraints). */
export function getSkillStatuses(): SkillStatus[] {
  const anthropic = envReady("ANTHROPIC_API_KEY");
  const tavily = envReady("TAVILY_API_KEY");
  const voyage = getVoyageProvider().isConfigured;
  const serviceRole = envReady("SUPABASE_SERVICE_ROLE_KEY");

  return [
    {
      key: "web_search",
      readiness: tavily ? "ready" : "unavailable",
      requirement: "TAVILY_API_KEY",
      note: tavily
        ? "Pesquisa na internet via Tavily (notícias, factos recentes)."
        : "Indisponível: defina TAVILY_API_KEY nas variáveis de ambiente (Vercel → Production).",
    },
    {
      key: "read_document",
      readiness: "ready",
      note:
        "Lê PDF, Word, Excel, PowerPoint, CSV, TXT e imagens (OCR via Claude Vision). " +
        "Requer ficheiro no storage (anexo no chat ou Knowledge).",
    },
    {
      key: "vision",
      readiness: anthropic ? "ready" : "unavailable",
      requirement: "ANTHROPIC_API_KEY",
      note: anthropic
        ? "Análise de imagens com o modelo Claude do agente."
        : "Indisponível: ANTHROPIC_API_KEY em falta.",
    },
    {
      key: "knowledge_search",
      readiness: voyage ? "ready" : "degraded",
      requirement: voyage ? undefined : "VOYAGE_API_KEY",
      note: voyage
        ? "RAG semântico com embeddings Voyage-3."
        : "Modo degradado: embeddings pseudo-hash (qualidade de pesquisa muito limitada). Configure VOYAGE_API_KEY.",
    },
    {
      key: "http_request",
      readiness: "ready",
      note:
        "Chamadas HTTP GET/POST a URLs públicas. Restrito por allowlist de hosts no agente. " +
        "Redirects bloqueados por segurança.",
    },
    {
      key: "sql_query",
      readiness: "ready",
      note:
        "Apenas SELECT na base de dados GMC (via RPC). Máx. 100 linhas por defeito. " +
        "Só dados do agente e tabelas permitidas.",
    },
    {
      key: "run_code",
      readiness: "ready",
      note:
        "JavaScript sandboxed (sem rede nem filesystem). Timeout 5s. " +
        "Para Python use o nó «Correr código» nos flows.",
    },
  ];
}

export function getSkillStatus(key: string): SkillStatus | undefined {
  return getSkillStatuses().find((s) => s.key === key);
}

export function isSkillOperational(key: string): boolean {
  const status = getSkillStatus(key);
  return status?.readiness !== "unavailable";
}
