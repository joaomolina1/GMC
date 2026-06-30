export const TOOL_CREATE_DOCUMENTS = "create_documents";
export const TOOL_WEB_SEARCH = "web_search";

const DEFAULT_ENABLED_TOOLS = [
  TOOL_WEB_SEARCH,
  TOOL_CREATE_DOCUMENTS,
  "read_document",
  "vision",
  "knowledge_search",
];

export function agentToolsFromVersion(skills: unknown): string[] {
  if (Array.isArray(skills) && skills.length > 0) {
    return skills.filter((s): s is string => typeof s === "string");
  }
  return DEFAULT_ENABLED_TOOLS;
}

export function isCreateDocumentsEnabled(skills: unknown): boolean {
  return agentToolsFromVersion(skills).includes(TOOL_CREATE_DOCUMENTS);
}

export function isWebSearchEnabled(skills: unknown): boolean {
  const tools = agentToolsFromVersion(skills);
  return tools.includes(TOOL_WEB_SEARCH);
}
