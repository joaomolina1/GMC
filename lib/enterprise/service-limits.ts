import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuotaStatus } from "./quotas";
import type { RateLimitResult } from "./rate-limit";

export async function checkRateLimitForUser(
  supabase: SupabaseClient,
  endpoint: string,
  userId: string
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_rate_limit_for_user_svc", {
    p_endpoint: endpoint,
    p_user_id: userId,
  });

  if (error || !data) {
    console.warn("[rate-limit-svc] RPC unavailable:", error?.message);
    return { allowed: true, limit: 60, current: 0, endpoint };
  }

  return data as RateLimitResult;
}

export async function getQuotaStatusForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaStatus | null> {
  const { data, error } = await supabase.rpc("get_user_quota_status_svc", {
    p_user_id: userId,
  });
  if (error || !data) return null;
  return data as QuotaStatus;
}

export async function assertRateLimitForUser(
  supabase: SupabaseClient,
  endpoint: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await checkRateLimitForUser(supabase, endpoint, userId);
  if (!result.allowed) {
    return {
      ok: false,
      message: `Rate limit excedido (${result.current}/${result.limit} req/min)`,
    };
  }
  return { ok: true };
}

export async function assertQuotaForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const status = await getQuotaStatusForUser(supabase, userId);
  if (!status) return { ok: true };
  if (status.quota_exceeded) {
    return {
      ok: false,
      message: `Quota mensal excedida para o titular da API key`,
    };
  }
  return { ok: true };
}
