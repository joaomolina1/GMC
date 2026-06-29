import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: flowId, versionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const action = body.action as "publish";

  if (action === "publish") {
    await supabase
      .from("flow_versions")
      .update({ status: "archived" })
      .eq("flow_id", flowId)
      .eq("status", "published");

    const { data: version, error } = await supabase
      .from("flow_versions")
      .update({ status: "published" })
      .eq("id", versionId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("flows")
      .update({ current_version_id: versionId, status: "published" })
      .eq("id", flowId);

    await logAudit(supabase, {
      actorId: user.id,
      action: "flow.version.publish",
      entityType: "flow_version",
      entityId: versionId,
      metadata: { flowId },
    });

    return NextResponse.json(version);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
