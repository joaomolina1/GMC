import { describe, expect, it } from "vitest";
import {
  detectDocumentSkillsFromText,
  needsDocumentCreation,
  resolveDocumentSkillsForTurn,
} from "@lib/ai/document-skill-detect";
import { mergeContainerSkills } from "@lib/ai/anthropic-document-skills";
import { modelSupportsDocumentSkills } from "@lib/ai/document-skills-guard";
import { getModelMaxTokens } from "@lib/ai/model-limits";
import {
  agentToolsFromVersion,
  isCreateDocumentsEnabled,
  isWebSearchEnabled,
} from "@lib/agents/agent-tools";

describe("document skill detect", () => {
  it("detects powerpoint / excel / pdf in Portuguese and English", () => {
    expect(detectDocumentSkillsFromText("faz uma apresentação")).toContain("pptx");
    expect(detectDocumentSkillsFromText("exportar para excel")).toContain("xlsx");
    expect(detectDocumentSkillsFromText("gera um pdf")).toContain("pdf");
  });

  it("defaults to docx when file intent is ambiguous", () => {
    expect(needsDocumentCreation("cria um ficheiro com o resumo")).toBe(true);
    expect(resolveDocumentSkillsForTurn("cria um ficheiro com o resumo")).toEqual(["docx"]);
  });
});

describe("mergeContainerSkills", () => {
  it("combines native document skills with custom skills", () => {
    const skills = mergeContainerSkills({
      createDocuments: true,
      documentSkillIds: ["pptx"],
      customSkills: [{ type: "custom", skill_id: "skill_01", version: "latest" }],
    });
    expect(skills).toEqual([
      { type: "anthropic", skill_id: "pptx", version: "latest" },
      { type: "custom", skill_id: "skill_01", version: "latest" },
    ]);
  });

  it("returns only custom skills when not creating documents", () => {
    const skills = mergeContainerSkills({
      createDocuments: false,
      documentSkillIds: ["pptx"],
      customSkills: [{ type: "custom", skill_id: "skill_01", version: "latest" }],
    });
    expect(skills).toEqual([{ type: "custom", skill_id: "skill_01", version: "latest" }]);
  });

  it("returns undefined when nothing to attach", () => {
    expect(mergeContainerSkills({ createDocuments: false })).toBeUndefined();
  });
});

describe("document skills guard", () => {
  it("supports current frontier models", () => {
    expect(modelSupportsDocumentSkills("claude-opus-5")).toBe(true);
    expect(modelSupportsDocumentSkills("claude-sonnet-5")).toBe(true);
    expect(modelSupportsDocumentSkills("claude-3-5-sonnet-20241022")).toBe(false);
  });
});

describe("model limits", () => {
  it("uses higher max tokens for documents", () => {
    expect(getModelMaxTokens("claude-sonnet-5", true)).toBe(16384);
    expect(getModelMaxTokens("claude-sonnet-5")).toBe(8192);
  });
});

describe("agent tools from version", () => {
  it("reads the skills array", () => {
    expect(agentToolsFromVersion(["web_search"])).toEqual(["web_search"]);
    expect(isWebSearchEnabled(["web_search"])).toBe(true);
    expect(isCreateDocumentsEnabled(["create_documents"])).toBe(true);
  });

  it("falls back to defaults when empty", () => {
    const defaults = agentToolsFromVersion([]);
    expect(defaults).toContain("web_search");
    expect(defaults).toContain("create_documents");
  });
});
