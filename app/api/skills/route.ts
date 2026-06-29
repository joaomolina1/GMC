import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { listAllSkills, listCoreSkills, listPluginSkills } from "@lib/skills/registry";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dbSkills } = await supabase.from("skills").select("*").eq("enabled", true);
  const runtimeSkills = listAllSkills();

  return NextResponse.json({
    catalog: dbSkills ?? [],
    runtime: runtimeSkills.map((s) => ({
      key: s.key,
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    })),
    core: listCoreSkills().map((s) => s.key),
    plugins: listPluginSkills().map((s) => s.key),
  });
}
