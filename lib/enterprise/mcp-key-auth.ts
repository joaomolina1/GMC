import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const MCP_KEY_PREFIX = "mcp_";

export interface PlatformMcpKeyContext {
  keyId: string;
  userId: string;
}

export function hashMcpKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateMcpKeySecret(): string {
  return `${MCP_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function extractMcpBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]) return null;
  return match[1].trim();
}

/**
 * Validate an MCP client Bearer token against DB keys, with optional env fallback.
 * Returns null when unauthorized.
 */
export async function authenticateMcpBearerToken(
  authorizationHeader: string | null | undefined,
  envFallbackToken?: string | null
): Promise<PlatformMcpKeyContext | { legacy: true } | null> {
  const token = extractMcpBearerToken(authorizationHeader);
  if (!token) return null;

  if (token.startsWith(MCP_KEY_PREFIX)) {
    const supabase = await tryCreateServiceClient();
    if (supabase) {
      const keyHash = hashMcpKey(token);
      const { data, error } = await supabase.rpc("validate_platform_mcp_key", {
        p_key_hash: keyHash,
      });
      if (!error && data) {
        const payload = data as { id: string; user_id: string };
        return { keyId: payload.id, userId: payload.user_id };
      }
      // Invalid mcp_ key — do not fall through to env (wrong prefix match risk is low,
      // but reject explicitly so revoked keys stay revoked).
      return null;
    }
  }

  const fallback = envFallbackToken?.trim() || null;
  if (fallback && safeEqual(token, fallback)) {
    return { legacy: true };
  }

  return null;
}
