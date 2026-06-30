/** Platform default LLM for all agents (Claude Haiku 3.5). */
export const DEFAULT_AGENT_MODEL = "claude-3-5-haiku-20241022";

export function canChangeAgentModel(role: string | null | undefined): boolean {
  return role === "super_admin";
}
