import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSkillPackageIds,
  withoutSkillPackageId,
  withSkillPackageId,
} from "@lib/agent-skills/ids";

/** Persist skill package membership on the agent's current version immediately. */
export async function updateCurrentVersionSkillIds(
  supabase: SupabaseClient,
  agentId: string,
  mutate: (ids: string[]) => string[]
): Promise<string[] | null> {
  const { data: agent } = await supabase
    .from("agents")
    .select("current_version_id")
    .eq("id", agentId)
    .single();

  if (!agent?.current_version_id) return null;

  const { data: version } = await supabase
    .from("agent_versions")
    .select("id, skill_package_ids")
    .eq("id", agent.current_version_id)
    .single();

  if (!version) return null;

  const next = mutate(parseSkillPackageIds(version.skill_package_ids));
  const { error } = await supabase
    .from("agent_versions")
    .update({ skill_package_ids: next })
    .eq("id", version.id);

  if (error) {
    console.warn("[skills] failed to update version skill_package_ids", error.message);
    return null;
  }
  return next;
}

export async function attachSkillToCurrentVersion(
  supabase: SupabaseClient,
  agentId: string,
  packageId: string
): Promise<string[] | null> {
  return updateCurrentVersionSkillIds(supabase, agentId, (ids) =>
    withSkillPackageId(ids, packageId)
  );
}

export async function detachSkillFromCurrentVersion(
  supabase: SupabaseClient,
  agentId: string,
  packageId: string
): Promise<string[] | null> {
  return updateCurrentVersionSkillIds(supabase, agentId, (ids) =>
    withoutSkillPackageId(ids, packageId)
  );
}
