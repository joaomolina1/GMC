import { describe, expect, it } from "vitest";
import { resolveAgentRoute } from "@lib/chat/agent";
import type { AgentConfig } from "@lib/chat/agent";
import type { ChatMessage } from "@lib/ai/types";

const base: AgentConfig = {
  model: "claude-sonnet-5",
  systemPrompt: "sys",
  webSearch: true,
};

describe("resolveAgentRoute", () => {
  it("uses the light path without skills or documents", () => {
    const route = resolveAgentRoute(base, [{ role: "user", content: "Olá" }]);
    expect(route).toEqual({ route: "light", createDocumentsThisTurn: false });
  });

  it("uses beta-session when custom Anthropic skills are attached", () => {
    const route = resolveAgentRoute(
      {
        ...base,
        customSkills: [{ type: "custom", skill_id: "skill_01", version: "latest" }],
      },
      [{ role: "user", content: "Usa a skill da marca" }]
    );
    expect(route.route).toBe("beta-session");
    expect(route.createDocumentsThisTurn).toBe(false);
  });

  it("uses beta-session when hasAgentSkills is set even without an API id yet", () => {
    const route = resolveAgentRoute(
      { ...base, hasAgentSkills: true },
      [{ role: "user", content: "Segue a skill" }]
    );
    expect(route.route).toBe("beta-session");
  });

  it("loads document skills together with custom skills", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Cria um powerpoint da marca" }];
    const route = resolveAgentRoute(
      {
        ...base,
        createDocuments: true,
        customSkills: [{ type: "custom", skill_id: "skill_01", version: "latest" }],
      },
      messages
    );
    expect(route.route).toBe("beta-documents");
    expect(route.createDocumentsThisTurn).toBe(true);
    expect(route.documentSkillIds).toContain("pptx");
  });
});
