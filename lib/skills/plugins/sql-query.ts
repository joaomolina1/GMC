import type { SkillDefinition } from "../types";
import { validateReadonlySql } from "./security";

export const sqlQuerySkill: SkillDefinition = {
  key: "sql_query",
  name: "SQL Query",
  description:
    "Run read-only SELECT queries against the GMC database. Use to inspect agent data, knowledge documents, usage stats, or other permitted tables. Only SELECT is allowed.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A SELECT SQL query (read-only). Example: SELECT name, status FROM agents WHERE id = '...'",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = validateReadonlySql(String(params.query));
    const config = ctx.skillConfigs?.sql_query ?? {};
    const maxRows = Number(config.max_rows ?? 100);

    const { data, error } = await ctx.supabase.rpc("execute_readonly_sql", {
      p_agent_id: ctx.agentId,
      p_query: query,
      p_max_rows: maxRows,
    });

    if (error) {
      return `SQL error: ${error.message}`;
    }

    const rows = data as unknown[] | null;
    if (!rows || rows.length === 0) {
      return "Query returned 0 rows.";
    }

    return `Query returned ${rows.length} row(s):\n\n${JSON.stringify(rows, null, 2)}`;
  },
};
