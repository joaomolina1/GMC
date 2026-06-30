import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@lib/audit";

interface CloneResult {
  agentId: string;
  name: string;
}

export async function cloneMarketplaceAgent(
  supabase: SupabaseClient,
  userId: string,
  sourceAgentId: string
): Promise<CloneResult> {
  const { data: source, error: sourceError } = await supabase
    .from("agents")
    .select("*, agent_versions!agent_versions_agent_id_fkey(*)")
    .eq("id", sourceAgentId)
    .eq("visibility", "public")
    .eq("status", "published")
    .single();

  if (sourceError || !source) {
    throw new Error("Agente não encontrado no marketplace");
  }

  if (source.owner_id === userId) {
    throw new Error("Já é o proprietário deste agente");
  }

  const version =
    source.agent_versions?.find(
      (v: { id: string }) => v.id === source.current_version_id
    ) ?? source.agent_versions?.[0];

  if (!version) {
    throw new Error("Versão publicada não encontrada");
  }

  const cloneName = `${source.name} (cópia)`;

  const { data: newAgent, error: agentError } = await supabase
    .from("agents")
    .insert({
      owner_id: userId,
      name: cloneName,
      description: source.description ?? "",
      image_url: source.image_url,
      category: source.category,
      tags: source.tags ?? [],
      visibility: "private",
      status: "draft",
    })
    .select()
    .single();

  if (agentError || !newAgent) {
    throw new Error(agentError?.message ?? "Falha ao clonar agente");
  }

  const { data: newVersion, error: versionError } = await supabase
    .from("agent_versions")
    .insert({
      agent_id: newAgent.id,
      version: 1,
      system_prompt: version.system_prompt,
      model: version.model,
      temperature: version.temperature,
      effort: version.effort ?? "medium",
      thinking_enabled: version.thinking_enabled ?? false,
      skills: [],
      tools: version.tools ?? [],
      status: "draft",
      created_by: userId,
    })
    .select()
    .single();

  if (versionError || !newVersion) {
    await supabase.from("agents").delete().eq("id", newAgent.id);
    throw new Error(versionError?.message ?? "Falha ao clonar versão");
  }

  await supabase
    .from("agents")
    .update({ current_version_id: newVersion.id })
    .eq("id", newAgent.id);

  await supabase.from("agent_clones").insert({
    source_agent_id: sourceAgentId,
    cloned_agent_id: newAgent.id,
    cloned_by: userId,
  });

  await supabase.rpc("increment_agent_downloads", { p_agent_id: sourceAgentId });

  await logAudit(supabase, {
    actorId: userId,
    action: "marketplace.clone",
    entityType: "agent",
    entityId: newAgent.id,
    metadata: { sourceAgentId },
  });

  return { agentId: newAgent.id, name: cloneName };
}
