import { CHANNELS, LIVE_PATH_EXCLUDES, WEB_RULES } from "./channels";
import type { ChartbeatHost, ChartbeatPage, MatchedSource, SourceKind, UnmatchedLive } from "./types";

const KNOWN_HOSTS = new Set(WEB_RULES.map((r) => r.host));

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Chartbeat devolve o path de três formas:
 * - URL web com host: `tviplayer.iol.pt/direto/tvi`
 * - pathname: `/direto/tvi`
 * - título da app (sem URL): `Direto - TVI`
 */
export function parsePageLocation(
  page: Pick<ChartbeatPage, "host" | "path">
): { host: string; pathname: string; kind: SourceKind } {
  const host = normalizeHost(page.host || "");
  let raw = (page.path || "").trim();
  raw = raw.replace(/^https?:\/\//i, "");

  const lower = raw.toLowerCase();
  const hostPrefix = host ? `${host}/` : "";

  const looksWeb =
    Boolean(host) &&
    (lower === host ||
      (hostPrefix && lower.startsWith(hostPrefix)) ||
      lower.startsWith("/") ||
      /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(lower));

  if (!looksWeb) {
    return { host, pathname: raw, kind: "app" };
  }

  let rest = lower;
  // `cnnportugal.iol.pt/direto` ou um host diferente no path (raro).
  const pathHostMatch = rest.match(/^([a-z0-9.-]+\.[a-z.]+)(\/.*)?$/i);
  if (pathHostMatch && pathHostMatch[1].includes(".")) {
    const pathHost = normalizeHost(pathHostMatch[1]);
    rest = pathHostMatch[2] || "/";
    return { host: pathHost || host, pathname: collapsePath(rest), kind: "web" };
  }

  return { host, pathname: collapsePath(rest.startsWith("/") ? rest : `/${rest}`), kind: "web" };
}

function collapsePath(pathname: string): string {
  const noQs = pathname.split("?")[0].split("#")[0];
  if (!noQs || noQs === "/") return "/";
  return noQs.replace(/\/+$/, "") || "/";
}

function foldAppLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\|.*$/, "")
    .replace(/[_/]+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** App nativa: `Direto - TVI Reality`, `Direto CNN Portugal`. */
export function matchAppLabel(label: string): string | null {
  const s = foldAppLabel(label);
  if (!s.startsWith("direto")) return null;
  const rest = s.replace(/^direto\s*-?\s*/, "").trim();
  if (!rest) return null;
  if (/(^|\b)cnn\b/.test(rest)) return "cnn";
  if (/tvi\s*reality/.test(rest) || rest === "tvireality") return "tvi-reality";
  if (/tvi\s*ficc?ao/.test(rest) || rest === "tvificcao") return "tvi-ficcao";
  if (/tvi\s*internacional/.test(rest) || rest === "tviinternacional") return "tvi-internacional";
  if (/^(v\+\s*tvi|vmais(\s*tvi)?|v mais tvi)$/.test(rest) || rest.includes("v+ tvi")) return "vmais-tvi";
  if (/^tvi$/.test(rest) || rest.startsWith("tvi ")) return "tvi";
  return null;
}

export function matchWebPath(host: string, pathname: string): string | null {
  const h = normalizeHost(host);
  if (LIVE_PATH_EXCLUDES.has(pathname)) return null;
  if (!KNOWN_HOSTS.has(h as ChartbeatHost)) return null;
  for (const rule of WEB_RULES) {
    if (rule.host !== h) continue;
    if (rule.pathnames.includes(pathname)) return rule.slug;
  }
  return null;
}

export function matchPage(page: ChartbeatPage): MatchedSource | null {
  const loc = parsePageLocation(page);
  const people = Number.isFinite(page.people) ? Math.max(0, Math.round(page.people)) : 0;
  const title = page.title || page.path || "";

  if (loc.kind === "web") {
    const slug = matchWebPath(loc.host, loc.pathname);
    if (!slug) return null;
    return {
      channelSlug: slug,
      host: loc.host,
      path: page.path,
      title,
      people,
      kind: "web",
      pathname: loc.pathname,
    };
  }

  const slug = matchAppLabel(loc.pathname) ?? matchAppLabel(title);
  if (!slug) return null;
  return {
    channelSlug: slug,
    host: loc.host,
    path: page.path,
    title,
    people,
    kind: "app",
    pathname: loc.pathname,
  };
}

export function looksLikeLive(page: ChartbeatPage): boolean {
  const loc = parsePageLocation(page);
  if (loc.kind === "web") {
    return loc.pathname === "/direto" || loc.pathname.startsWith("/direto/");
  }
  const folded = foldAppLabel(`${loc.pathname} ${page.title || ""}`);
  return folded.startsWith("direto");
}

export function channelSlugs(): string[] {
  return CHANNELS.map((c) => c.slug);
}

export type Unmatched = UnmatchedLive;
