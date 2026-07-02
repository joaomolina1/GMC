import type { SupabaseClient } from "@supabase/supabase-js";

export interface AgentAccessRow {
  owner_id: string;
  visibility: string;
  status: string;
}

/** Owner can always chat; others only on published public agents. */
export function canChatWithAgent(
  userId: string,
  agent: AgentAccessRow
): boolean {
  if (agent.owner_id === userId) return true;
  if (agent.status !== "published") return false;
  return agent.visibility === "public";
}

export async function loadAgentForAccess(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentAccessRow | null> {
  const { data } = await supabase
    .from("agents")
    .select("owner_id, visibility, status")
    .eq("id", agentId)
    .single();
  return data ?? null;
}
