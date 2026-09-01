import { describe, expect, it } from "vitest";
import {
  isSkillMdPath,
  pathRelativeToSkillRoot,
  skillRootPrefix,
} from "@lib/agent-skills/paths";

describe("skill paths", () => {
  it("detects SKILL.md at root or nested", () => {
    expect(isSkillMdPath("SKILL.md")).toBe(true);
    expect(isSkillMdPath("brand/SKILL.md")).toBe(true);
    expect(isSkillMdPath("brand/README.md")).toBe(false);
  });

  it("computes the skill root prefix", () => {
    expect(skillRootPrefix("SKILL.md")).toBe("");
    expect(skillRootPrefix("brand-slides/SKILL.md")).toBe("brand-slides/");
  });

  it("strips the skill root from extra file paths", () => {
    expect(pathRelativeToSkillRoot("brand-slides/slide-templates/a.html", "brand-slides/SKILL.md")).toBe(
      "slide-templates/a.html"
    );
    expect(pathRelativeToSkillRoot("scripts/foo.py", "SKILL.md")).toBe("scripts/foo.py");
  });
});
