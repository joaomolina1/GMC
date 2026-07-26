import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireOwnedAgent,
} from "@lib/enterprise/v1-helpers";
import { authenticatePlatformApiKey } from "@lib/enterprise/api-key-auth";
import { scopeImplies } from "@lib/enterprise/platform-scopes";
import { tryCreateServiceClient } from "@lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  const auth = await authenticatePlatformApiKey(request);
  if (!auth.ok) return auth.response;

  const canRead =
    scopeImplies(auth.ctx.scopes, "knowledge:read") ||
    scopeImplies(auth.ctx.scopes, "agents:read");
  if (!canRead) {
    return NextResponse.json(
      { error: "Scope em falta: knowledge:read ou agents:read" },
      { status: 403 }
    );
  }

  const supabase = await tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  return listDocs(supabase, auth.ctx.userId, agentId, auth.ctx.allowedAgentIds);
}

async function listDocs(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
  allowedAgentIds: string[] | null
) {
  const owned = await requireOwnedAgent(supabase, userId, agentId, allowedAgentIds);
  if (!owned.ok) return owned.response;

  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, filename, mime, status, metadata, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
