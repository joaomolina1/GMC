/** Platform default LLM for all agents (Claude Haiku 4.5). */
export const DEFAULT_AGENT_MODEL = "claude-haiku-4-5";

export function canChangeAgentModel(role: string | null | undefined): boolean {
  return role === "super_admin";
}
