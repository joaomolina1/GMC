import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@lib/ai/embeddings";

const TOOL_OUTPUT_MAX_CHARS = 12_000;
const TOOL_TIMEOUT_MS = 30_000;
const HTTP_MAX_BODY_CHARS = 8_000;

export interface ToolHandlerContext {
  agentId?: string;
  userId?: string;
  supabase?: SupabaseClient;
}

export interface ExecutedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
}

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolHandlerContext
) => Promise<{ content: string; isError?: boolean }>;

const TOOL_DEFINITIONS: Record<string, Tool> = {
  knowledge_search: {
    name: "knowledge_search",
    description:
      "Pesquisa semântica na base de conhecimento do agente. Use quando precisar de factos dos documentos carregados.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Pergunta ou termos de pesquisa" },
      },
      required: ["query"],
    },
  },
  http_request: {
    name: "http_request",
    description:
      "Faz um pedido HTTP (GET/POST/PUT/PATCH/DELETE). Apenas URLs públicas http/https.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string" },
      },
      required: ["url"],
    },
  },
  fetch_url: {
    name: "fetch_url",
    description: "Obtém o conteúdo textual de uma URL pública (html simplificado ou texto).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL http ou https" },
      },
      required: ["url"],
    },
  },
  get_time: {
    name: "get_time",
    description: "Devolve a data e hora actuais em UTC (útil para testes e agendamentos).",
    input_schema: { type: "object", properties: {} },
  },
};

function truncateOutput(text: string): string {
  if (text.length <= TOOL_OUTPUT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n…[truncado]`;
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false;
    if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tool timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

const handlers: Record<string, ToolHandler> = {
  async knowledge_search(input, ctx) {
    const query = String(input.query ?? "").trim();
    if (!query) return { content: "query é obrigatório", isError: true };
    if (!ctx.supabase || !ctx.agentId) {
      return { content: "Knowledge search indisponível (contexto em falta)", isError: true };
    }

    const { count } = await ctx.supabase
      .from("knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", ctx.agentId);

    if (!count) return { content: "Nenhum documento na base de conhecimento deste agente." };

    const embedding = await embedQuery(query);
    const { data, error } = await ctx.supabase.rpc("match_chunks", {
      p_agent_id: ctx.agentId,
      p_query_embedding: embedding,
      p_match_count: 5,
    });

    if (error) return { content: error.message, isError: true };
    if (!data?.length) return { content: "Nenhum resultado relevante encontrado." };

    const formatted = (data as Array<{ content: string; similarity: number; metadata: Record<string, unknown> }>)
      .map((chunk, i) => {
        const filename = chunk.metadata?.filename ?? "documento";
        return `[${i + 1}] (${filename}, sim=${chunk.similarity.toFixed(2)})\n${chunk.content}`;
      })
      .join("\n\n---\n\n");

    return { content: formatted };
  },

  async http_request(input) {
    const url = String(input.url ?? "");
    const method = String(input.method ?? "GET").toUpperCase();
    if (!isAllowedUrl(url)) return { content: "URL não permitida", isError: true };

    const headers = (input.headers as Record<string, string> | undefined) ?? {};
    const body = input.body != null ? String(input.body) : undefined;

    const res = await withTimeout(
      fetch(url, {
        method,
        headers: { "User-Agent": "GMC-Agent/1.0", ...headers },
        body: method === "GET" || method === "DELETE" ? undefined : body,
      }),
      TOOL_TIMEOUT_MS
    );

    const text = await res.text();
    return {
      content: truncateOutput(
        `HTTP ${res.status} ${res.statusText}\n\n${text}`
      ),
      isError: !res.ok,
    };
  },

  async fetch_url(input) {
    const url = String(input.url ?? "");
    if (!isAllowedUrl(url)) return { content: "URL não permitida", isError: true };

    const res = await withTimeout(
      fetch(url, { headers: { "User-Agent": "GMC-Agent/1.0" } }),
      TOOL_TIMEOUT_MS
    );
    const raw = await res.text();
    const simplified = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      content: truncateOutput(`URL: ${url}\nHTTP ${res.status}\n\n${simplified}`),
      isError: !res.ok,
    };
  },

  async get_time() {
    return { content: new Date().toISOString() };
  },
};

/** Map UI tool ids to runtime tool names. */
const TOOL_ID_ALIASES: Record<string, string> = {
  sql_query: "run_sql",
};

export function resolveRuntimeToolIds(enabledToolIds: string[]): string[] {
  const runtimeIds = new Set<string>();

  for (const id of enabledToolIds) {
    const mapped = TOOL_ID_ALIASES[id] ?? id;
    if (TOOL_DEFINITIONS[mapped] && handlers[mapped]) {
      runtimeIds.add(mapped);
    }
  }

  return Array.from(runtimeIds);
}

export interface AgentToolRegistry {
  definitions: Tool[];
  execute(
    name: string,
    input: Record<string, unknown>,
    toolUseId: string
  ): Promise<ExecutedToolCall>;
}

export function buildAgentToolRegistry(
  enabledToolIds: string[],
  ctx: ToolHandlerContext
): AgentToolRegistry {
  const names = resolveRuntimeToolIds(enabledToolIds);
  const definitions = names
    .map((name) => TOOL_DEFINITIONS[name])
    .filter((d): d is Tool => Boolean(d));

  return {
    definitions,
    async execute(name, input, toolUseId) {
      const handler = handlers[name];
      if (!handler) {
        return {
          id: toolUseId,
          name,
          input,
          result: `Tool desconhecida: ${name}`,
          isError: true,
        };
      }

      try {
        const { content, isError } = await handler(input, ctx);
        return {
          id: toolUseId,
          name,
          input,
          result: truncateOutput(content),
          isError: Boolean(isError),
        };
      } catch (err) {
        return {
          id: toolUseId,
          name,
          input,
          result: err instanceof Error ? err.message : "Erro ao executar tool",
          isError: true,
        };
      }
    },
  };
}
