import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run, error } = await supabase
    .from("flow_runs")
    .select("*, flow_run_steps(*)")
    .eq("id", runId)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  }

  return NextResponse.json(run);
}
