import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import { DEFAULT_FLOW_GRAPH } from "@lib/flows/constants";
import { authenticateV1Request } from "@lib/enterprise/v1-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authenticateV1Request(request, "flows:read");
  if (!auth.ok) return auth.response;

  let query = auth.supabase
    .from("flows")
    .select("id, name, description, status, current_version_id, updated_at, created_at")
    .eq("owner_id", auth.ctx.userId)
    .order("updated_at", { ascending: false });

  if (auth.ctx.allowedFlowIds?.length) {
    query = query.in("id", auth.ctx.allowedFlowIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await authenticateV1Request(request, "flows:write");
  if (!auth.ok) return auth.response;

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { data: flow, error: flowError } = await auth.supabase
    .from("flows")
    .insert({
      owner_id: auth.ctx.userId,
      name: body.name?.trim() || "Novo Flow",
      description: body.description ?? "",
      status: "draft",
    })
    .select()
    .single();

  if (flowError || !flow) {
    return NextResponse.json(
      { error: flowError?.message ?? "Falha ao criar flow" },
      { status: 500 }
    );
  }

  const { data: version, error: versionError } = await auth.supabase
    .from("flow_versions")
    .insert({
      flow_id: flow.id,
      version: 1,
      graph: DEFAULT_FLOW_GRAPH,
      status: "draft",
      created_by: auth.ctx.userId,
    })
    .select()
    .single();

  if (versionError || !version) {
    await auth.supabase.from("flows").delete().eq("id", flow.id);
    return NextResponse.json(
      { error: versionError?.message ?? "Falha ao criar versão do flow" },
      { status: 500 }
    );
  }

  await auth.supabase
    .from("flows")
    .update({ current_version_id: version.id })
    .eq("id", flow.id);

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "flow.create",
    entityType: "flow",
    entityId: flow.id,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId },
  });

  return NextResponse.json({
    ...flow,
    current_version_id: version.id,
    current_version: version,
  });
}
