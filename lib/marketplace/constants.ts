export const MARKETPLACE_CATEGORIES = [
  { id: "geral", label: "Geral" },
  { id: "marketing", label: "Marketing" },
  { id: "juridico", label: "Jurídico" },
  { id: "rh", label: "Recursos Humanos" },
  { id: "financas", label: "Finanças" },
  { id: "tecnologia", label: "Tecnologia" },
  { id: "conteudo", label: "Conteúdo" },
  { id: "suporte", label: "Suporte" },
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]["id"];

export const MARKETPLACE_SORT_OPTIONS = [
  { id: "recent", label: "Mais recentes" },
  { id: "downloads", label: "Mais populares" },
  { id: "rating", label: "Melhor avaliados" },
] as const;

export type MarketplaceSort = (typeof MARKETPLACE_SORT_OPTIONS)[number]["id"];

export type MarketplaceTab = "all" | "favorites" | "following";

export function getCategoryLabel(id: string | null | undefined): string {
  if (!id) return "Geral";
  return MARKETPLACE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
