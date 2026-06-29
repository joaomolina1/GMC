import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { EXAMPLE_FLOWS } from "@lib/flows/examples";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase.from("flows").select("name");
  const existingNames = new Set((existing ?? []).map((f) => f.name));

  const created: Array<{ id: string; name: string }> = [];
  const skipped: string[] = [];

  for (const example of EXAMPLE_FLOWS) {
    if (existingNames.has(example.name)) {
      skipped.push(example.name);
      continue;
    }

    const { data: flow, error: flowError } = await supabase
      .from("flows")
      .insert({
        owner_id: user.id,
        name: example.name,
        description: example.description,
        status: "published",
      })
      .select("id")
      .single();

    if (flowError || !flow) {
      return NextResponse.json({ error: flowError?.message ?? "Falha ao criar flow" }, { status: 500 });
    }

    const { data: version, error: versionError } = await supabase
      .from("flow_versions")
      .insert({
        flow_id: flow.id,
        version: 1,
        graph: example.graph,
        status: "published",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: versionError?.message ?? "Falha ao criar versão" }, { status: 500 });
    }

    await supabase
      .from("flows")
      .update({ current_version_id: version.id })
      .eq("id", flow.id);

    created.push({ id: flow.id, name: example.name });
    existingNames.add(example.name);
  }

  return NextResponse.json({ created, skipped, count: created.length });
}
