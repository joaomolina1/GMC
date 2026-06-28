import type { SupabaseClient } from "@supabase/supabase-js";

export async function logUsage(
  supabase: SupabaseClient,
  data: {
    userId: string;
    model: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    costEur: number;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("usage_logs").insert({
    user_id: data.userId,
    model: data.model,
    provider: data.provider,
    prompt_tokens: data.promptTokens,
    completion_tokens: data.completionTokens,
    cost_eur: data.costEur,
    latency_ms: data.latencyMs,
    metadata: data.metadata ?? {},
  });
}

export async function logAudit(
  supabase: SupabaseClient,
  data: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("audit_logs").insert({
    actor_id: data.actorId,
    action: data.action,
    entity_type: data.entityType,
    entity_id: data.entityId,
    metadata: data.metadata ?? {},
  });
}
