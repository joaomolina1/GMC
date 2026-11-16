/**
 * Funcionalidades da plataforma e acesso por utilizador.
 *
 * profiles.allowed_features = NULL → acesso a tudo (comportamento antigo).
 * Caso contrário, o utilizador só vê e só abre as funcionalidades listadas.
 * Admins (admin/super_admin) nunca são restringidos.
 * O valor é espelhado em auth.users.app_metadata (features, gmc_role, must_change_password)
 * para o middleware decidir sem consultar tabelas.
 */

export type FeatureKey = "agentes" | "flows" | "clips" | "tvibox" | "chartbeat" | "escalas";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  descricao: string;
  /** Página de entrada. */
  home: string;
  /** Prefixos de páginas e APIs que pertencem a esta funcionalidade. */
  paths: string[];
}

export const FEATURES: FeatureDef[] = [
  {
    key: "agentes",
    label: "Agentes",
    descricao: "Agentes de IA, chat, marketplace e conhecimento",
    home: "/",
    paths: [
      "/agents",
      "/marketplace",
      "/api/agents",
      "/api/chat",
      "/api/conversations",
      "/api/attachments",
      "/api/files",
      "/api/knowledge",
      "/api/marketplace",
      "/api/models",
      "/api/skills",
      "/api/enterprise",
    ],
  },
  { key: "flows", label: "Flows", descricao: "Editor e execução de flows", home: "/flows", paths: ["/flows", "/api/flows"] },
  { key: "clips", label: "Clips", descricao: "Cortes de vídeo assistidos", home: "/clips", paths: ["/clips", "/api/clips"] },
  { key: "tvibox", label: "TVI Box", descricao: "Feed vertical de séries", home: "/tvibox", paths: ["/tvibox", "/api/tvibox"] },
  {
    key: "chartbeat",
    label: "Chartbeat · Diretos",
    descricao: "Audiências digitais em direto",
    home: "/chartbeat",
    paths: ["/chartbeat", "/api/chartbeat"],
  },
  { key: "escalas", label: "Escalas", descricao: "Escalas, turnos e ausências", home: "/escalas", paths: ["/escalas", "/api/escalas"] },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export interface AcessoConta {
  /** null = sem restrição. */
  features: FeatureKey[] | null;
  admin: boolean;
  mustChangePassword: boolean;
}

/** Lê o acesso a partir do app_metadata do utilizador do Supabase Auth. */
export function acessoDeMetadata(meta: Record<string, unknown> | null | undefined): AcessoConta {
  const m = meta ?? {};
  const raw = m.features;
  const features = Array.isArray(raw) ? (raw.filter((x) => FEATURE_KEYS.includes(x as FeatureKey)) as FeatureKey[]) : null;
  const role = typeof m.gmc_role === "string" ? m.gmc_role : "";
  return {
    features,
    admin: role === "admin" || role === "super_admin",
    mustChangePassword: m.must_change_password === true,
  };
}

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

/** Funcionalidade a que pertence um caminho; "/" é a entrada dos Agentes. */
export function featureDoCaminho(pathname: string): FeatureKey | null {
  if (pathname === "/") return "agentes";
  for (const f of FEATURES) if (f.paths.some((p) => matches(pathname, p))) return f.key;
  return null;
}

export function podeUsar(acesso: Pick<AcessoConta, "features" | "admin">, key: FeatureKey) {
  return acesso.admin || acesso.features === null || acesso.features.includes(key);
}

/** Página inicial de um utilizador restringido (primeira funcionalidade permitida). */
export function homeDoUtilizador(acesso: Pick<AcessoConta, "features" | "admin">): string {
  if (acesso.admin || acesso.features === null) return "/";
  const first = FEATURES.find((f) => acesso.features!.includes(f.key));
  return first?.home ?? "/conta/sem-acesso";
}

/**
 * Caminhos sempre permitidos a um utilizador autenticado (conta, autenticação, health),
 * mesmo restringido.
 */
export function caminhoLivre(pathname: string) {
  return (
    matches(pathname, "/conta") ||
    matches(pathname, "/api/conta") ||
    matches(pathname, "/auth") ||
    pathname === "/login" ||
    matches(pathname, "/api/health")
  );
}
