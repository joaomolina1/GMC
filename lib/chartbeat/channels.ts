import type { ChannelDef, ChartbeatHost } from "./types";

/** Hosts Chartbeat (Site ID / `_sf_async_config.domain`) que auscultamos. */
export const CHARTBEAT_HOSTS: { host: ChartbeatHost; label: string }[] = [
  { host: "tviplayer.iol.pt", label: "TVI Player" },
  { host: "cnnportugal.iol.pt", label: "CNN Portugal" },
];

/**
 * Canais lineares. Vários paths Chartbeat (web com casing diferente, app nativa)
 * mapeiam para o mesmo slug — é o ponto da zona.
 *
 * `pathnames` são exact-match depois de normalizar (lowercase, sem trailing slash).
 */
export interface ChannelMatchRule {
  slug: string;
  host: ChartbeatHost;
  pathnames: string[];
}

export const CHANNELS: ChannelDef[] = [
  {
    slug: "tvi",
    name: "TVI",
    color: "#ca234d",
    sortOrder: 1,
    videoIds: ["554a58200cf203057812d86b"],
    videoHost: "tviplayer.iol.pt",
  },
  {
    slug: "cnn",
    name: "CNN Portugal",
    color: "#7f1d1d",
    sortOrder: 2,
    videoIds: ["618427ce0cf2648aa1626c36"],
    videoHost: "cnnportugal.iol.pt",
  },
  {
    slug: "tvi-reality",
    name: "TVI Reality",
    color: "#7c3aed",
    sortOrder: 3,
    videoIds: ["555dc2af0cf250949d24a2fa"],
    videoHost: "tviplayer.iol.pt",
  },
  {
    slug: "tvi-ficcao",
    name: "TVI Ficção",
    color: "#d97706",
    sortOrder: 4,
    videoIds: [],
  },
  {
    slug: "tvi-internacional",
    name: "TVI Internacional",
    color: "#0284c7",
    sortOrder: 5,
    videoIds: [],
  },
  {
    slug: "vmais-tvi",
    name: "V+ TVI",
    color: "#16a34a",
    sortOrder: 6,
    videoIds: [],
  },
];

export const CHANNEL_BY_SLUG: Record<string, ChannelDef> = Object.fromEntries(
  CHANNELS.map((c) => [c.slug, c])
);

/** Regras web, da mais específica para a mais genérica (`/direto` da TVI por último). */
export const WEB_RULES: ChannelMatchRule[] = [
  { slug: "cnn", host: "tviplayer.iol.pt", pathnames: ["/direto/cnn"] },
  { slug: "cnn", host: "cnnportugal.iol.pt", pathnames: ["/direto"] },
  { slug: "tvi-reality", host: "tviplayer.iol.pt", pathnames: ["/direto/tvireality"] },
  { slug: "tvi-ficcao", host: "tviplayer.iol.pt", pathnames: ["/direto/tvificcao"] },
  { slug: "tvi-internacional", host: "tviplayer.iol.pt", pathnames: ["/direto/tviinternacional"] },
  { slug: "vmais-tvi", host: "tviplayer.iol.pt", pathnames: ["/direto/vmais"] },
  { slug: "tvi", host: "tviplayer.iol.pt", pathnames: ["/direto", "/direto/tvi"] },
];

/** Subpaths de `/direto` que não são o player (listagens, etc.). */
export const LIVE_PATH_EXCLUDES = new Set(["/direto/videos"]);
