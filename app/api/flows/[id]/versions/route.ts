import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("flow_versions")
    .select("*")
    .eq("flow_id", flowId)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: flowId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { graph } = body;

  const { data: latest } = await supabase
    .from("flow_versions")
    .select("version")
    .eq("flow_id", flowId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: version, error } = await supabase
    .from("flow_versions")
    .insert({
      flow_id: flowId,
      version: nextVersion,
      graph: graph ?? { nodes: [], edges: [] },
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("flows")
    .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
    .eq("id", flowId);

  await logAudit(supabase, {
    actorId: user.id,
    action: "flow.version.create",
    entityType: "flow_version",
    entityId: version.id,
    metadata: { flowId, version: nextVersion },
  });

  return NextResponse.json(version);
}
