const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTS = new Set(["metadata.google.internal", "169.254.169.254"]);

export function validateOutboundUrl(
  rawUrl: string,
  allowedHosts?: string[]
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL inválido");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Apenas HTTP/HTTPS são permitidos");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error("Host bloqueado por segurança");
  }

  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
    throw new Error("Endereços privados/locais não são permitidos (SSRF)");
  }

  if (allowedHosts && allowedHosts.length > 0) {
    const allowed = allowedHosts.some((pattern) => {
      const p = pattern.toLowerCase().replace(/^\*\./, "");
      return hostname === p || hostname.endsWith(`.${p}`);
    });
    if (!allowed) {
      throw new Error(`Host não autorizado. Permitidos: ${allowedHosts.join(", ")}`);
    }
  }

  return parsed;
}

export function validateReadonlySql(query: string): string {
  const normalized = query.trim().replace(/;\s*$/, "");
  const lower = normalized.toLowerCase();

  if (!lower.startsWith("select")) {
    throw new Error("Apenas queries SELECT são permitidas");
  }

  const forbidden =
    /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|execute|copy|pg_sleep|pg_read_file|lo_import|dblink)\b/i;
  if (forbidden.test(normalized)) {
    throw new Error("Query contém operação não permitida");
  }

  if (normalized.includes(";")) {
    throw new Error("Múltiplas statements não são permitidas");
  }

  return normalized;
}
