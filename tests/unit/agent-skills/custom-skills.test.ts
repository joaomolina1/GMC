import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCustomContainerSkills,
  createAnthropicCustomSkill,
  ensureAnthropicSkillIds,
  filesForAnthropicSkillCreate,
} from "@lib/agent-skills/anthropic-custom-skills";
import type { AgentSkillPackageRow } from "@lib/agent-skills/prompt";

describe("filesForAnthropicSkillCreate", () => {
  it("puts SKILL.md and extras under the same top-level directory", () => {
    const files = filesForAnthropicSkillCreate({
      name: "brand-slides",
      skillMd: "# hello",
      extraFiles: [{ path: "slide-templates/cover.html", content: "<html/>" }],
    });
    expect(files.map((f) => f.path)).toEqual([
      "brand-slides/SKILL.md",
      "brand-slides/slide-templates/cover.html",
    ]);
  });

  it("skips nested SKILL.md duplicates and empty files", () => {
    const files = filesForAnthropicSkillCreate({
      name: "demo",
      skillMd: "# root",
      extraFiles: [
        { path: "SKILL.md", content: "# nested" },
        { path: "notes.md", content: "   " },
        { path: "ok.py", content: "print(1)" },
      ],
    });
    expect(files.map((f) => f.path)).toEqual(["demo/SKILL.md", "demo/ok.py"]);
  });

  it("rejects path traversal in extra files", () => {
    const files = filesForAnthropicSkillCreate({
      name: "demo",
      skillMd: "# root",
      extraFiles: [{ path: "../secret.py", content: "x" }],
    });
    expect(files.map((f) => f.path)).toEqual(["demo/SKILL.md"]);
  });
});

describe("buildCustomContainerSkills", () => {
  it("emits unique custom skill refs", () => {
    expect(
      buildCustomContainerSkills([
        { anthropic_skill_id: "skill_a" },
        { anthropic_skill_id: "skill_a" },
        { anthropic_skill_id: "  " },
        { anthropic_skill_id: "skill_b" },
      ])
    ).toEqual([
      { type: "custom", skill_id: "skill_a", version: "latest" },
      { type: "custom", skill_id: "skill_b", version: "latest" },
    ]);
  });
});

describe("createAnthropicCustomSkill", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a config error without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await createAnthropicCustomSkill({ name: "x", skillMd: "# x" });
    expect(result.skillId).toBeNull();
    expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("posts multipart files and returns the skill id", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("display_title")).toBe("brand-slides");
      return new Response(JSON.stringify({ id: "skill_01ZZ" }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await createAnthropicCustomSkill(
      { name: "brand-slides", skillMd: "# hi" },
      fetchImpl
    );
    expect(result).toEqual({ skillId: "skill_01ZZ" });
  });

  it("surfaces API errors", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "invalid skill" } }), {
        status: 400,
      });
    }) as unknown as typeof fetch;

    const result = await createAnthropicCustomSkill(
      { name: "x", skillMd: "# x" },
      fetchImpl
    );
    expect(result.skillId).toBeNull();
    expect(result.error).toBe("invalid skill");
  });
});

describe("ensureAnthropicSkillIds", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers missing IDs and persists them", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "skill_new" }), { status: 200 });
    }) as unknown as typeof fetch;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;

    const persisted: string[] = [];
    const packages: AgentSkillPackageRow[] = [
      {
        id: "pkg-1",
        name: "demo",
        description: "d",
        skill_md: "# demo",
      },
      {
        id: "pkg-2",
        name: "already",
        description: "d",
        skill_md: "# already",
        anthropic_skill_id: "skill_old",
      },
    ];

    try {
      const next = await ensureAnthropicSkillIds(packages, async (pkg) => {
        persisted.push(`${pkg.id}:${pkg.anthropic_skill_id}`);
      });
      expect(next[0].anthropic_skill_id).toBe("skill_new");
      expect(next[1].anthropic_skill_id).toBe("skill_old");
      expect(persisted).toEqual(["pkg-1:skill_new"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
