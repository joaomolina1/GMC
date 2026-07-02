import type { EffortLevel } from "@lib/ai/types";

export interface McpConnectionRow {
  id: string;
  name: string;
  server_url: string;
  allowed_tools: string[] | null;
  enabled: boolean;
  created_at: string;
}

export interface SkillPackageRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface AgentVersion {
  id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature?: number;
  effort?: EffortLevel;
  thinking_enabled?: boolean;
  skills: string[];
  skill_package_ids?: string[];
  tools?: Record<string, Record<string, unknown>>;
  status: string;
  published_at: string | null;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  visibility: string;
  status: string;
  current_version_id: string;
  agent_versions: AgentVersion[];
}
