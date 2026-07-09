import type { SupabaseClient } from "@supabase/supabase-js";
import { isProductionDeploy } from "@lib/env";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  endpoint: string;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  endpoint: string,
  userId?: string
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_and_increment_rate_limit", {
    p_endpoint: endpoint,
    p_user_id: userId,
  });

  if (error || !data) {
    if (isProductionDeploy()) {
      console.error("[rate-limit] RPC unavailable in production, blocking:", error?.message);
      return { allowed: false, limit: 0, current: 0, endpoint };
    }
    console.warn("[rate-limit] RPC unavailable, allowing request:", error?.message);
    return { allowed: true, limit: 60, current: 0, endpoint };
  }

  return data as RateLimitResult;
}

export async function assertRateLimit(
  supabase: SupabaseClient,
  endpoint: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await checkRateLimit(supabase, endpoint, userId);
  if (!result.allowed) {
    return {
      ok: false,
      message: `Rate limit excedido (${result.current}/${result.limit} req/min em ${endpoint})`,
    };
  }
  return { ok: true };
}
