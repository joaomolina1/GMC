import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GmcApiClient } from "../clients/gmc-api-client.js";
import { toToolErrorPayload } from "../errors.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: toToolErrorPayload(err) }, null, 2),
      },
    ],
    isError: true,
  };
}

export function registerGmcTools(server: McpServer, client: GmcApiClient) {
  server.registerTool(
    "get_platform_capabilities",
    {
      description:
        "Discover GMC platform capabilities: available scopes, agent tools, flow node types, and API endpoints.",
    },
    async () => {
      try {
        return jsonResult(await client.get("/api/v1/capabilities"));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_agents",
    { description: "List agents owned by the API key user." },
    async () => {
      try {
        return jsonResult(await client.get("/api/v1/agents"));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_agent",
    {
      description: "Get an agent with all versions (system prompt, skills, tools).",
      inputSchema: { agent_id: z.string().uuid().describe("Agent UUID") },
    },
    async ({ agent_id }) => {
      try {
        return jsonResult(await client.get(`/api/v1/agents/${agent_id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "create_agent",
    {
      description:
        "Create a new agent with an initial draft version. Set skills (tools) like web_search, create_documents, knowledge_search.",
      inputSchema: {
        name: z.string().min(1).describe("Agent name"),
        description: z.string().optional().describe("Short description"),
        system_prompt: z
          .string()
          .optional()
          .describe("System prompt / instructions for the agent"),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Enabled tools: web_search, create_documents, read_document, vision, knowledge_search, http_request, fetch_url"
          ),
        visibility: z.enum(["private", "team", "public"]).optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        return jsonResult(await client.post("/api/v1/agents", args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_agent",
    {
      description: "Update agent metadata (name, description, visibility, status).",
      inputSchema: {
        agent_id: z.string().uuid(),
        name: z.string().optional(),
        description: z.string().optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      },
    },
    async ({ agent_id, ...body }) => {
      try {
        return jsonResult(await client.patch(`/api/v1/agents/${agent_id}`, body));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_agent_config",
    {
      description:
        "Update the agent's current version (system prompt, skills/tools, effort). Publishes the agent so it becomes runnable. Use create_snapshot=true to create v+1.",
      inputSchema: {
        agent_id: z.string().uuid(),
        system_prompt: z.string().optional(),
        skills: z
          .array(z.string())
          .optional()
          .describe("Tool keys enabled on this version"),
        effort: z.enum(["low", "medium", "high", "max"]).optional(),
        thinking_enabled: z.boolean().optional(),
        max_steps: z.number().int().min(1).max(50).optional(),
        create_snapshot: z
          .boolean()
          .optional()
          .describe("If true, create a new version (v+1) instead of updating in place"),
        publish: z
          .boolean()
          .optional()
          .describe("Publish agent after save (default true)"),
      },
    },
    async ({ agent_id, create_snapshot, ...rest }) => {
      try {
        return jsonResult(
          await client.post(`/api/v1/agents/${agent_id}/versions`, {
            ...rest,
            createSnapshot: create_snapshot,
          })
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "delete_agent",
    {
      description: "Permanently delete an agent and its versions.",
      inputSchema: { agent_id: z.string().uuid() },
    },
    async ({ agent_id }) => {
      try {
        return jsonResult(await client.delete(`/api/v1/agents/${agent_id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "run_agent",
    {
      description:
        "Execute a published agent with an input message. Returns output text, usage, and any generated files.",
      inputSchema: {
        agent_id: z.string().uuid(),
        input: z
          .union([
            z.string(),
            z.object({
              message: z.string(),
              context: z.unknown().optional(),
            }),
          ])
          .describe("User message string, or { message, context }"),
      },
    },
    async ({ agent_id, input }) => {
      try {
        return jsonResult(await client.post(`/api/v1/agents/${agent_id}/run`, { input }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_flows",
    { description: "List flows owned by the API key user." },
    async () => {
      try {
        return jsonResult(await client.get("/api/v1/flows"));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_flow",
    {
      description: "Get a flow with all versions and the current graph (nodes + edges).",
      inputSchema: { flow_id: z.string().uuid() },
    },
    async ({ flow_id }) => {
      try {
        return jsonResult(await client.get(`/api/v1/flows/${flow_id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "create_flow",
    {
      description: "Create a new flow with a default graph (trigger → output).",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return jsonResult(await client.post("/api/v1/flows", args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_flow",
    {
      description:
        "Update flow metadata and/or replace the graph. Node types: trigger, agent, condition, transform, code, output. Agent nodes need data.agentId and data.prompt.",
      inputSchema: {
        flow_id: z.string().uuid(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        graph: z
          .object({
            nodes: z.array(
              z.object({
                id: z.string(),
                type: z.enum([
                  "trigger",
                  "agent",
                  "condition",
                  "transform",
                  "code",
                  "output",
                ]),
                position: z.object({ x: z.number(), y: z.number() }),
                data: z.record(z.unknown()),
              })
            ),
            edges: z.array(
              z.object({
                id: z.string(),
                source: z.string(),
                target: z.string(),
                data: z
                  .object({ branch: z.enum(["true", "false"]).optional() })
                  .optional(),
              })
            ),
          })
          .optional()
          .describe("Full flow graph to save"),
        publish: z.boolean().optional().describe("Publish after update"),
        create_snapshot: z
          .boolean()
          .optional()
          .describe("Create v+1 instead of updating current version in place"),
      },
    },
    async ({ flow_id, create_snapshot, ...body }) => {
      try {
        return jsonResult(
          await client.patch(`/api/v1/flows/${flow_id}`, {
            ...body,
            createSnapshot: create_snapshot,
          })
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "orchestrate_agent_flow",
    {
      description:
        "Convenience helper: build a linear flow trigger → agent → output wired to an existing agent, then save+publish it.",
      inputSchema: {
        flow_id: z.string().uuid().describe("Existing flow to update"),
        agent_id: z.string().uuid().describe("Agent to run in the middle node"),
        prompt_template: z
          .string()
          .optional()
          .describe("Prompt for the agent node. Default: {{input}}"),
        flow_name: z.string().optional(),
        publish: z.boolean().optional().default(true),
      },
    },
    async ({ flow_id, agent_id, prompt_template, flow_name, publish }) => {
      try {
        const graph = {
          nodes: [
            {
              id: "trigger-1",
              type: "trigger" as const,
              position: { x: 60, y: 140 },
              data: { label: "Início", input: "" },
            },
            {
              id: "agent-1",
              type: "agent" as const,
              position: { x: 280, y: 140 },
              data: {
                label: "Agente",
                agentId: agent_id,
                prompt: prompt_template ?? "{{input}}",
              },
            },
            {
              id: "output-1",
              type: "output" as const,
              position: { x: 520, y: 140 },
              data: { label: "Resultado" },
            },
          ],
          edges: [
            { id: "e-t-a", source: "trigger-1", target: "agent-1" },
            { id: "e-a-o", source: "agent-1", target: "output-1" },
          ],
        };

        return jsonResult(
          await client.patch(`/api/v1/flows/${flow_id}`, {
            ...(flow_name ? { name: flow_name } : {}),
            graph,
            publish: publish ?? true,
          })
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "delete_flow",
    {
      description: "Permanently delete a flow.",
      inputSchema: { flow_id: z.string().uuid() },
    },
    async ({ flow_id }) => {
      try {
        return jsonResult(await client.delete(`/api/v1/flows/${flow_id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "run_flow",
    {
      description:
        "Execute a flow with an input. Returns run_id, status, output and step results.",
      inputSchema: {
        flow_id: z.string().uuid(),
        input: z
          .union([
            z.string(),
            z.object({
              message: z.string(),
              context: z.unknown().optional(),
            }),
          ])
          .describe("Input text or { message, context }"),
      },
    },
    async ({ flow_id, input }) => {
      try {
        return jsonResult(await client.post(`/api/v1/flows/${flow_id}/run`, { input }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_flow_run",
    {
      description: "Get status and steps of a previous flow run.",
      inputSchema: {
        flow_id: z.string().uuid(),
        run_id: z.string().uuid(),
      },
    },
    async ({ flow_id, run_id }) => {
      try {
        return jsonResult(await client.get(`/api/v1/flows/${flow_id}/runs/${run_id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "list_knowledge_documents",
    {
      description: "List knowledge documents indexed for an owned agent (RAG corpus).",
      inputSchema: { agent_id: z.string().uuid() },
    },
    async ({ agent_id }) => {
      try {
        return jsonResult(await client.get(`/api/v1/agents/${agent_id}/knowledge`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
