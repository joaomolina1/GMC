import { describe, expect, it } from "vitest";
import { buildAgentSkillsPrompt, type AgentSkillPackageRow } from "@lib/agent-skills/prompt";

const native: AgentSkillPackageRow = {
  id: "1",
  name: "brand-slides",
  description: "Slides da marca",
  skill_md: "# full native instructions that should stay out of the prompt",
  anthropic_skill_id: "skill_01ABC",
};

const fallback: AgentSkillPackageRow = {
  id: "2",
  name: "legal-review",
  description: "Revisão jurídica",
  skill_md: "# Segue o checklist jurídico",
};

describe("buildAgentSkillsPrompt", () => {
  it("returns empty for no packages", () => {
    expect(buildAgentSkillsPrompt([])).toBe("");
  });

  it("lists the catalog and skips full SKILL.md for native API skills", () => {
    const prompt = buildAgentSkillsPrompt([native]);
    expect(prompt).toContain("brand-slides");
    expect(prompt).toContain("Slides da marca");
    expect(prompt).toContain("container");
    expect(prompt).not.toContain("full native instructions");
  });

  it("includes full SKILL.md for packages without anthropic_skill_id", () => {
    const prompt = buildAgentSkillsPrompt([fallback]);
    expect(prompt).toContain("checklist jurídico");
    expect(prompt).toContain("Instruções completas");
  });

  it("mixes native catalog with fallback instructions", () => {
    const prompt = buildAgentSkillsPrompt([native, fallback]);
    expect(prompt).toContain("brand-slides");
    expect(prompt).toContain("legal-review");
    expect(prompt).toContain("checklist jurídico");
    expect(prompt).not.toContain("full native instructions");
  });
});
