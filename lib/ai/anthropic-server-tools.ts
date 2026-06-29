import type { ToolUnion, WebSearchTool20250305 } from "@anthropic-ai/sdk/resources/messages/messages";

export const ANTHROPIC_SERVER_SKILLS = ["web_search"] as const;
export type AnthropicServerSkill = (typeof ANTHROPIC_SERVER_SKILLS)[number];

export function isAnthropicServerSkill(key: string): key is AnthropicServerSkill {
  return (ANTHROPIC_SERVER_SKILLS as readonly string[]).includes(key);
}

/** Anthropic-executed tools (web search runs on Anthropic's servers, not ours). */
export function buildAnthropicServerTools(
  skillKeys: string[],
  skillConfigs?: Record<string, Record<string, unknown>>
): ToolUnion[] {
  const tools: ToolUnion[] = [];

  if (skillKeys.includes("web_search")) {
    const cfg = skillConfigs?.web_search ?? {};
    const webSearch: WebSearchTool20250305 = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: typeof cfg.max_uses === "number" ? cfg.max_uses : 5,
    };

    if (Array.isArray(cfg.allowed_domains) && cfg.allowed_domains.length > 0) {
      webSearch.allowed_domains = cfg.allowed_domains as string[];
    }
    if (Array.isArray(cfg.blocked_domains) && cfg.blocked_domains.length > 0) {
      webSearch.blocked_domains = cfg.blocked_domains as string[];
    }
    if (cfg.user_location && typeof cfg.user_location === "object") {
      webSearch.user_location = cfg.user_location as WebSearchTool20250305.UserLocation;
    }

    tools.push(webSearch);
  }

  return tools;
}
