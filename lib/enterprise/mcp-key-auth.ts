import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { tryCreateServiceClient } from "@lib/supabase/server";
import { decryptLinkedApiKeySecret } from "@lib/enterprise/mcp-key-crypto";

export const MCP_KEY_PREFIX = "mcp_";

export type PlatformMcpKeyContext = {
  kind: "db";
  keyId: string;
  userId: string;
  /** Decrypted companion gmc_live_ secret for calling /api/v1 */
  apiKeySecret: string | null;
};

export type LegacyMcpAuthContext = {
  kind: "legacy";
};

export type McpAuthContext = PlatformMcpKeyContext | LegacyMcpAuthContext;

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
): Promise<McpAuthContext | null> {
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
        const payload = data as {
          id: string;
          user_id: string;
          linked_api_key_ciphertext?: string | null;
        };
        let apiKeySecret: string | null = null;
        if (payload.linked_api_key_ciphertext) {
          try {
            apiKeySecret = decryptLinkedApiKeySecret(payload.linked_api_key_ciphertext);
          } catch {
            apiKeySecret = null;
          }
        }
        return {
          kind: "db",
          keyId: payload.id,
          userId: payload.user_id,
          apiKeySecret,
        };
      }
      // Invalid mcp_ key — do not fall through to env.
      return null;
    }
  }

  const fallback = envFallbackToken?.trim() || null;
  if (fallback && safeEqual(token, fallback)) {
    return { kind: "legacy" };
  }

  return null;
}
