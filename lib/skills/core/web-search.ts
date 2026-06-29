import type { SkillDefinition } from "../types";

export const webSearchSkill: SkillDefinition = {
  key: "web_search",
  name: "Web Search",
  description:
    "Search the internet for current information. Use when the user asks about recent events, news, or facts you are unsure about. Only works when TAVILY_API_KEY is configured on the server.",
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

    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (!tavilyKey) {
      return [
        "ERRO: Web Search indisponível.",
        "O servidor não tem TAVILY_API_KEY configurada.",
        "Peça ao administrador para adicionar a chave em Vercel → Environment Variables (Production).",
        "Obtenha uma chave em https://tavily.com",
        "",
        `Query pedida: "${query}"`,
      ].join("\n");
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: maxResults,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return `ERRO Tavily (${res.status}): ${errText.slice(0, 500) || res.statusText}`;
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string }>;
    };

    const parts: string[] = [];
    if (data.answer) {
      parts.push(`**Resumo:** ${data.answer}`);
    }

    const results = data.results ?? [];
    if (results.length === 0) {
      parts.push(`Sem resultados para "${query}".`);
    } else {
      parts.push(
        results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content}`)
          .join("\n\n")
      );
    }

    return parts.join("\n\n");
  },
};
