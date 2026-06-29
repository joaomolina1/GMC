import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotaStatus {
  tokens_used: number;
  cost_used_eur: number;
  monthly_token_limit: number | null;
  monthly_cost_limit_eur: number | null;
  tokens_remaining: number | null;
  cost_remaining_eur: number | null;
  quota_exceeded: boolean;
}

export async function getQuotaStatus(
  supabase: SupabaseClient,
  userId?: string
): Promise<QuotaStatus | null> {
  const { data, error } = await supabase.rpc("get_user_quota_status", {
    p_user_id: userId,
  });
  if (error || !data) return null;
  return data as QuotaStatus;
}

export async function assertQuotaAvailable(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const status = await getQuotaStatus(supabase, userId);
  if (!status) return { ok: true };
  if (status.quota_exceeded) {
    return {
      ok: false,
      message: `Quota mensal excedida. Tokens: ${status.tokens_used}/${status.monthly_token_limit ?? "∞"}, Custo: €${Number(status.cost_used_eur).toFixed(2)}/€${status.monthly_cost_limit_eur ?? "∞"}`,
    };
  }
  return { ok: true };
}
