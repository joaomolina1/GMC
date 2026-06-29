import type { SkillDefinition } from "../types";

export const webSearchSkill: SkillDefinition = {
  key: "web_search",
  name: "Web Search",
  description:
    "Search the internet for current information. Use when the user asks about recent events, news, or facts you are unsure about.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      max_results: { type: "number", description: "Max results (default 5)" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query);
    const maxResults = Number(params.max_results ?? 5);

    // Try Tavily fallback if configured
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: maxResults }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results ?? []) as Array<{ title: string; url: string; content: string }>;
        return results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content}`)
          .join("\n\n");
      }
    }

    // Simulated search for demo when no API key
    return `Web search results for "${query}" (${maxResults} results):\n\n` +
      `Note: Configure TAVILY_API_KEY for live web search. ` +
      `For production, Anthropic's native web_search tool is preferred when available on the model.`;
  },
};
