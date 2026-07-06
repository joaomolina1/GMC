import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnrestrictedRole } from "@lib/enterprise/role-policies";

export interface AgentAccessRow {
  owner_id: string;
  visibility: string;
  status: string;
}

/** Owner can always chat; admins can test any agent; others only on published public agents. */
export function canChatWithAgent(
  userId: string,
  agent: AgentAccessRow,
  actorRole?: string | null
): boolean {
  if (agent.owner_id === userId) return true;
  if (actorRole && isUnrestrictedRole(actorRole)) return true;
  if (agent.status !== "published") return false;
  return agent.visibility === "public";
}

export async function canChatWithAgentResolved(
  supabase: SupabaseClient,
  userId: string,
  agent: AgentAccessRow
): Promise<boolean> {
  if (canChatWithAgent(userId, agent)) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return canChatWithAgent(userId, agent, profile?.role ?? null);
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
