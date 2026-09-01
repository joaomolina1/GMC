import { describe, expect, it } from "vitest";
import { selectFilesForContainer } from "@lib/agent-skills/container-files";
import type { AgentSkillPackageRow } from "@lib/agent-skills/prompt";

function pkg(partial: Partial<AgentSkillPackageRow> & { extra_files: AgentSkillPackageRow["extra_files"] }): AgentSkillPackageRow {
  return {
    id: partial.id ?? "1",
    name: partial.name ?? "skill",
    description: partial.description ?? "d",
    skill_md: partial.skill_md ?? "See `templates/a.html`",
    extra_files: partial.extra_files,
  };
}

describe("selectFilesForContainer", () => {
  it("prefers files referenced in SKILL.md", () => {
    const { selected } = selectFilesForContainer([
      pkg({
        extra_files: [
          { path: "noise.txt", content: "zzz" },
          { path: "templates/a.html", content: "<html>a</html>" },
        ],
      }),
    ]);
    expect(selected[0].file.path).toBe("templates/a.html");
  });

  it("skips empty files", () => {
    const { selected, skipped } = selectFilesForContainer([
      pkg({ extra_files: [{ path: "empty.md", content: "   " }] }),
    ]);
    expect(selected).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it("caps selection at 16 files", () => {
    const extra_files = Array.from({ length: 20 }, (_, i) => ({
      path: `f${i}.md`,
      content: `file ${i}`,
    }));
    const { selected, skipped } = selectFilesForContainer([pkg({ extra_files, skill_md: "none" })]);
    expect(selected).toHaveLength(16);
    expect(skipped).toBe(4);
  });
});
