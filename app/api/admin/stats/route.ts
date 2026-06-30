import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";

export async function GET() {
  const adminCheck = await requireAdmin();
  if ("error" in adminCheck) return adminCheck.error;
  const { supabase } = adminCheck;

  const monthStart = new Date(new Date().setDate(1)).toISOString();

  const [
    { count: agentCount },
    { count: conversationCount },
    { count: publicAgentCount },
    { data: usage },
    { count: userCount },
  ] = await Promise.all([
    supabase.from("agents").select("*", { count: "exact", head: true }),
    supabase.from("conversations").select("*", { count: "exact", head: true }),
    supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("visibility", "public")
      .eq("status", "published"),
    supabase.from("usage_logs").select("cost_eur").gte("created_at", monthStart),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const monthlyCost = (usage ?? []).reduce((sum, r) => sum + Number(r.cost_eur), 0);

  return NextResponse.json({
    agents: agentCount ?? 0,
    conversations: conversationCount ?? 0,
    publicAgents: publicAgentCount ?? 0,
    users: userCount ?? 0,
    monthlyCost,
  });
}
