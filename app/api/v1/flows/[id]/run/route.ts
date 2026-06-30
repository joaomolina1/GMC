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
import { canAccessFlow } from "@lib/agents/execute-agent";
import { runFlowViaApi } from "@lib/flows/execute-flow-api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;

  const auth = await authenticatePlatformApiKey(request);
  if (!auth.ok) return auth.response;

  const scopeError = requireScope(auth.ctx, "flows:run");
  if (scopeError) return scopeError;

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const rateCheck = await assertRateLimitForUser(
    supabase,
    "/api/v1/flows/run",
    auth.ctx.userId
  );
  if (!rateCheck.ok) {
    return NextResponse.json({ error: rateCheck.message }, { status: 429 });
  }

  const quotaCheck = await assertQuotaForUser(supabase, auth.ctx.userId);
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.message }, { status: 402 });
  }

  const allowed = await canAccessFlow(
    supabase,
    auth.ctx.userId,
    flowId,
    auth.ctx.allowedFlowIds
  );
  if (!allowed) {
    return NextResponse.json({ error: "Flow não encontrado ou sem acesso" }, { status: 404 });
  }

  let body: { input?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const result = await runFlowViaApi({
      supabase,
      userId: auth.ctx.userId,
      flowId,
      input: body.input,
      apiKeyId: auth.ctx.keyId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro na execução";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
