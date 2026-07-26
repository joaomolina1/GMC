import { NextResponse } from "next/server";
import { logAudit } from "@lib/audit";
import {
  authenticateV1Request,
  requireOwnedFlow,
} from "@lib/enterprise/v1-helpers";
import type { FlowGraph, FlowNodeType } from "@lib/flows/types";
import { FLOW_NODE_TYPES } from "@lib/flows/constants";

export const runtime = "nodejs";

const VALID_NODE_TYPES = new Set(FLOW_NODE_TYPES.map((n) => n.type));

function isValidGraph(graph: unknown): graph is FlowGraph {
  if (!graph || typeof graph !== "object") return false;
  const g = graph as FlowGraph;
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return false;
  for (const node of g.nodes) {
    if (!node?.id || !VALID_NODE_TYPES.has(node.type as FlowNodeType)) return false;
  }
  return true;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const auth = await authenticateV1Request(request, "flows:read");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedFlow(
    auth.supabase,
    auth.ctx.userId,
    flowId,
    auth.ctx.allowedFlowIds
  );
  if (!owned.ok) return owned.response;

  const { data, error } = await auth.supabase
    .from("flows")
    .select("*, flow_versions!flow_versions_flow_id_fkey(*)")
    .eq("id", flowId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const auth = await authenticateV1Request(request, "flows:write");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedFlow(
    auth.supabase,
    auth.ctx.userId,
    flowId,
    auth.ctx.allowedFlowIds
  );
  if (!owned.ok) return owned.response;

  let body: {
    name?: string;
    description?: string;
    status?: string;
    graph?: FlowGraph;
    publish?: boolean;
    createSnapshot?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.status !== undefined) patch.status = body.status;

  if (Object.keys(patch).length > 1) {
    const { error } = await auth.supabase.from("flows").update(patch).eq("id", flowId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let version = null;
  if (body.graph !== undefined) {
    if (!isValidGraph(body.graph)) {
      return NextResponse.json(
        {
          error:
            "graph inválido. nodes[].type deve ser um de: " +
            Array.from(VALID_NODE_TYPES).join(", "),
        },
        { status: 400 }
      );
    }

    const flow = owned.flow as { current_version_id: string | null };
    const createSnapshot = Boolean(body.createSnapshot) || !flow.current_version_id;

    if (!createSnapshot && flow.current_version_id) {
      const { data, error } = await auth.supabase
        .from("flow_versions")
        .update({ graph: body.graph })
        .eq("id", flow.current_version_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      version = data;
    } else {
      const { data: latest } = await auth.supabase
        .from("flow_versions")
        .select("version")
        .eq("flow_id", flowId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      await auth.supabase
        .from("flow_versions")
        .update({ status: "archived" })
        .eq("flow_id", flowId)
        .eq("status", "published");

      const { data, error } = await auth.supabase
        .from("flow_versions")
        .insert({
          flow_id: flowId,
          version: (latest?.version ?? 0) + 1,
          graph: body.graph,
          status: body.publish === false ? "draft" : "published",
          published_at: body.publish === false ? null : new Date().toISOString(),
          created_by: auth.ctx.userId,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      version = data;

      await auth.supabase
        .from("flows")
        .update({
          current_version_id: version.id,
          status: body.publish === false ? "draft" : "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", flowId);
    }
  }

  if (body.publish && !body.graph) {
    const flow = owned.flow as { current_version_id: string | null };
    if (flow.current_version_id) {
      await auth.supabase
        .from("flow_versions")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", flow.current_version_id);
    }
    await auth.supabase
      .from("flows")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", flowId);
  }

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "flow.update",
    entityType: "flow",
    entityId: flowId,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId, hasGraph: Boolean(body.graph) },
  });

  const { data: updated } = await auth.supabase
    .from("flows")
    .select("*, flow_versions!flow_versions_flow_id_fkey(*)")
    .eq("id", flowId)
    .single();

  return NextResponse.json({ ...updated, updated_version: version });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const auth = await authenticateV1Request(request, "flows:write");
  if (!auth.ok) return auth.response;

  const owned = await requireOwnedFlow(
    auth.supabase,
    auth.ctx.userId,
    flowId,
    auth.ctx.allowedFlowIds
  );
  if (!owned.ok) return owned.response;

  const { error } = await auth.supabase.from("flows").delete().eq("id", flowId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(auth.supabase, {
    actorId: auth.ctx.userId,
    action: "flow.delete",
    entityType: "flow",
    entityId: flowId,
    metadata: { source: "api_v1", apiKeyId: auth.ctx.keyId },
  });

  return NextResponse.json({ success: true });
}
