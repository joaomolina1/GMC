import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { logAudit } from "@lib/audit";
import { DEFAULT_FLOW_GRAPH } from "@lib/flows/constants";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description } = body;

  const { data: flow, error: flowError } = await supabase
    .from("flows")
    .insert({
      owner_id: user.id,
      name: name ?? "Novo Flow",
      description: description ?? "",
      status: "draft",
    })
    .select()
    .single();

  if (flowError) return NextResponse.json({ error: flowError.message }, { status: 500 });

  const { data: version, error: versionError } = await supabase
    .from("flow_versions")
    .insert({
      flow_id: flow.id,
      version: 1,
      graph: DEFAULT_FLOW_GRAPH,
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });

  await supabase
    .from("flows")
    .update({ current_version_id: version.id })
    .eq("id", flow.id);

  await logAudit(supabase, {
    actorId: user.id,
    action: "flow.create",
    entityType: "flow",
    entityId: flow.id,
  });

  return NextResponse.json({ ...flow, current_version: version });
}
