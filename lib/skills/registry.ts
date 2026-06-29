import type { SkillDefinition } from "./types";
import { webSearchSkill } from "./core/web-search";
import { readDocumentSkill } from "./core/read-document";
import { visionSkill } from "./core/vision";
import { knowledgeSearchSkill } from "./core/knowledge-search";
import { httpRequestSkill } from "./plugins/http-request";
import { sqlQuerySkill } from "./plugins/sql-query";
import { runCodeSkill } from "./plugins/run-code";

const coreSkills: SkillDefinition[] = [
  webSearchSkill,
  readDocumentSkill,
  visionSkill,
  knowledgeSearchSkill,
];

const pluginSkills: SkillDefinition[] = [
  httpRequestSkill,
  sqlQuerySkill,
  runCodeSkill,
];

const allSkills: SkillDefinition[] = [...coreSkills, ...pluginSkills];

const skillMap = new Map(allSkills.map((s) => [s.key, s]));

export function getSkill(key: string): SkillDefinition | undefined {
  return skillMap.get(key);
}

export function getSkillsForAgent(skillKeys: string[]): SkillDefinition[] {
  return skillKeys
    .map((key) => skillMap.get(key))
    .filter((s): s is SkillDefinition => s !== undefined);
}

export function listAllSkills(): SkillDefinition[] {
  return [...allSkills];
}

export function listCoreSkills(): SkillDefinition[] {
  return [...coreSkills];
}

export function listPluginSkills(): SkillDefinition[] {
  return [...pluginSkills];
}

export function resolveAgentSkills(
  skillsConfig: Array<string | { key: string; enabled?: boolean }>
): SkillDefinition[] {
  const keys = skillsConfig
    .map((s) => (typeof s === "string" ? s : s.enabled !== false ? s.key : null))
    .filter((k): k is string => k !== null);
  return getSkillsForAgent(keys);
}

export const PLUGIN_SKILL_KEYS = pluginSkills.map((s) => s.key);
