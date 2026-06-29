import type { SupabaseClient } from "@supabase/supabase-js";

export interface SkillContext {
  userId: string;
  agentId: string;
  conversationId?: string;
  supabase: SupabaseClient;
}

export interface SkillDefinition {
  key: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(params: Record<string, unknown>, ctx: SkillContext): Promise<string>;
}

export function toToolDefinition(skill: SkillDefinition) {
  return {
    name: skill.key,
    description: skill.description,
    input_schema: skill.inputSchema,
  };
}
