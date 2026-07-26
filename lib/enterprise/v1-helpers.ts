import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@lib/supabase/server";
import {
  authenticatePlatformApiKey,
  type PlatformApiKeyContext,
} from "@lib/enterprise/api-key-auth";
import { scopeImplies } from "@lib/enterprise/platform-scopes";

export type V1AuthSuccess = {
  ok: true;
  ctx: PlatformApiKeyContext;
  supabase: SupabaseClient;
};

export type V1AuthFailure = {
  ok: false;
  response: NextResponse;
};

export async function authenticateV1Request(
  request: Request,
  requiredScope: string
): Promise<V1AuthSuccess | V1AuthFailure> {
  const auth = await authenticatePlatformApiKey(request);
  if (!auth.ok) return auth;

  if (!scopeImplies(auth.ctx.scopes, requiredScope)) {
    return {
      ok: false,
      response: NextResponse.json({ error: `Scope em falta: ${requiredScope}` }, { status: 403 }),
    };
  }

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
    };
  }

  return { ok: true, ctx: auth.ctx, supabase };
}

export function agentAllowedByKey(
  agentId: string,
  allowedAgentIds: string[] | null
): boolean {
  if (!allowedAgentIds) return true;
  return allowedAgentIds.includes(agentId);
}

export function flowAllowedByKey(
  flowId: string,
  allowedFlowIds: string[] | null
): boolean {
  if (!allowedFlowIds) return true;
  return allowedFlowIds.includes(flowId);
}

export async function requireOwnedAgent(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  allowedAgentIds: string[] | null
): Promise<{ ok: true; agent: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  if (!agentAllowedByKey(agentId, allowedAgentIds)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Agente fora da allowlist da API key" }, { status: 403 }),
    };
  }

  const { data: agent, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !agent) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Agente não encontrado" }, { status: 404 }),
    };
  }

  if (agent.owner_id !== userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão neste agente" }, { status: 403 }),
    };
  }

  return { ok: true, agent };
}

export async function requireOwnedFlow(
  supabase: SupabaseClient,
  userId: string,
  flowId: string,
  allowedFlowIds: string[] | null
): Promise<{ ok: true; flow: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  if (!flowAllowedByKey(flowId, allowedFlowIds)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Flow fora da allowlist da API key" }, { status: 403 }),
    };
  }

  const { data: flow, error } = await supabase
    .from("flows")
    .select("*")
    .eq("id", flowId)
    .single();

  if (error || !flow) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Flow não encontrado" }, { status: 404 }),
    };
  }

  if (flow.owner_id !== userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão neste flow" }, { status: 403 }),
    };
  }

  return { ok: true, flow };
}
