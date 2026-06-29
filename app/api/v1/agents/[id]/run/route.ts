import { NextResponse } from "next/server";
import { tryCreateServiceClient } from "@lib/supabase/server";
import {
  authenticatePlatformApiKey,
  requireScope,
} from "@lib/enterprise/api-key-auth";
import {
  assertQuotaForUser,
  assertRateLimitForUser,
} from "@lib/enterprise/service-limits";
import {
  canAccessAgent,
  runAgentViaApi,
} from "@lib/agents/execute-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  const auth = await authenticatePlatformApiKey(request);
  if (!auth.ok) return auth.response;

  const scopeError = requireScope(auth.ctx, "agents:run");
  if (scopeError) return scopeError;

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const rateCheck = await assertRateLimitForUser(
    supabase,
    "/api/v1/agents/run",
    auth.ctx.userId
  );
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const quotaCheck = await assertQuotaForUser(supabase, auth.ctx.userId);
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.message }, { status: 402 });
  }

  const allowed = await canAccessAgent(
    supabase,
    auth.ctx.userId,
    agentId,
    auth.ctx.allowedAgentIds
  );
  if (!allowed) {
    return NextResponse.json({ error: "Agente não encontrado ou sem acesso" }, { status: 404 });
  }

  let body: { input?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const result = await runAgentViaApi({
      supabase,
      userId: auth.ctx.userId,
      agentId,
      input: body.input,
      apiKeyId: auth.ctx.keyId,
      fileStorage: supabase,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro na execução";
    const status = message.includes("Quota") || message.includes("modelo") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
