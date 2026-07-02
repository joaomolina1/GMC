/** Shared SSRF policy for outbound HTTP from agent tools. */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.goog",
]);

function parseIpv4(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".").map((p) => Number(p));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80:")) return true;
  return false;
}

export function isAllowedOutboundUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (BLOCKED_HOSTNAMES.has(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;

    const ipv4 = parseIpv4(host);
    if (ipv4 && isPrivateIpv4(ipv4)) return false;

    if (host.includes(":") && isPrivateIpv6(host)) return false;

    // Block link-local and metadata-style numeric hosts
    if (host === "169.254.169.254") return false;

    return true;
  } catch {
    return false;
  }
}
