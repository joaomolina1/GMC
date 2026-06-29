import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: agentId, versionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const action = body.action as "publish" | "rollback";

  if (action === "publish") {
    await supabase
      .from("agent_versions")
      .update({ status: "archived" })
      .eq("agent_id", agentId)
      .eq("status", "published");

    const { data: version, error } = await supabase
      .from("agent_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", versionId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("agents")
      .update({ current_version_id: versionId, status: "published" })
      .eq("id", agentId);

    await logAudit(supabase, {
      actorId: user.id,
      action: "agent.version.publish",
      entityType: "agent_version",
      entityId: versionId,
      metadata: { agentId, version: version.version },
    });

    return NextResponse.json(version);
  }

  if (action === "rollback") {
    const { data: version, error } = await supabase
      .from("agent_versions")
      .select("*")
      .eq("id", versionId)
      .single();

    if (error || !version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    await supabase
      .from("agent_versions")
      .update({ status: "archived" })
      .eq("agent_id", agentId)
      .eq("status", "published");

    await supabase
      .from("agent_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", versionId);

    await supabase
      .from("agents")
      .update({ current_version_id: versionId })
      .eq("id", agentId);

    await logAudit(supabase, {
      actorId: user.id,
      action: "agent.version.rollback",
      entityType: "agent_version",
      entityId: versionId,
      metadata: { agentId, version: version.version },
    });

    return NextResponse.json(version);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
