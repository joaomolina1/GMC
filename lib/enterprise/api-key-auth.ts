import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const API_KEY_PREFIX = "gmc_live_";

export interface PlatformApiKeyContext {
  keyId: string;
  userId: string;
  scopes: string[];
  allowedAgentIds: string[] | null;
  allowedFlowIds: string[] | null;
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKeySecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const headerKey = request.headers.get("x-api-key");
  return headerKey?.trim() || null;
}

export async function authenticatePlatformApiKey(
  request: Request
): Promise<
  | { ok: true; ctx: PlatformApiKeyContext }
  | { ok: false; response: NextResponse }
> {
  const token = extractBearerToken(request);
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API key em falta. Use Authorization: Bearer gmc_live_..." },
        { status: 401 }
      ),
    };
  }

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API externa indisponível (service role não configurada)" },
        { status: 503 }
      ),
    };
  }

  const keyHash = hashApiKey(token);
  const { data, error } = await supabase.rpc("validate_platform_api_key", {
    p_key_hash: keyHash,
  });

  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "API key inválida ou revogada" }, { status: 401 }),
    };
  }

  const payload = data as {
    id: string;
    user_id: string;
    scopes: string[];
    allowed_agent_ids: string[] | null;
    allowed_flow_ids: string[] | null;
  };

  return {
    ok: true,
    ctx: {
      keyId: payload.id,
      userId: payload.user_id,
      scopes: payload.scopes ?? [],
      allowedAgentIds: payload.allowed_agent_ids,
      allowedFlowIds: payload.allowed_flow_ids,
    },
  };
}

export function requireScope(
  ctx: PlatformApiKeyContext,
  scope: string
): NextResponse | null {
  if (!ctx.scopes.includes(scope)) {
    return NextResponse.json({ error: `Scope em falta: ${scope}` }, { status: 403 });
  }
  return null;
}
