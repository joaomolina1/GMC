import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseSkillMd, parseSkillUpload } from "@lib/agent-skills/parser";

const SKILL_MD = `---
name: brand-slides
description: Cria apresentações com o visual da marca Media Capital.
---

# Brand slides
Usa os templates em \`slide-templates/cover.html\`.
`;

describe("parseSkillMd", () => {
  it("reads YAML frontmatter", () => {
    const parsed = parseSkillMd(SKILL_MD);
    expect(parsed.name).toBe("brand-slides");
    expect(parsed.description).toContain("Media Capital");
    expect(parsed.skillMd).toContain("Brand slides");
  });

  it("rejects missing name", () => {
    expect(() =>
      parseSkillMd(`---
description: hello
---
body`)
    ).toThrow(/name/);
  });

  it("rejects invalid kebab-case name", () => {
    expect(() =>
      parseSkillMd(`---
name: Brand Slides
description: hello world
---
body`)
    ).toThrow(/kebab-case/);
  });

  it("rejects long descriptions", () => {
    expect(() =>
      parseSkillMd(`---
name: too-long
description: ${"x".repeat(1025)}
---
body`)
    ).toThrow(/1024/);
  });
});

describe("parseSkillUpload", () => {
  it("parses a raw SKILL.md", async () => {
    const parsed = await parseSkillUpload(Buffer.from(SKILL_MD), "SKILL.md");
    expect(parsed.name).toBe("brand-slides");
    expect(parsed.extraFiles).toEqual([]);
  });

  it("rejects unsupported formats", async () => {
    await expect(parseSkillUpload(Buffer.from("x"), "notes.txt")).rejects.toThrow(/Formato/);
  });

  it("extracts zip files relative to the SKILL.md directory", async () => {
    const zip = new JSZip();
    zip.file("brand-slides/SKILL.md", SKILL_MD);
    zip.file("brand-slides/slide-templates/cover.html", "<html>cover</html>");
    zip.file("brand-slides/scripts/build.py", "print('ok')");
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

    const parsed = await parseSkillUpload(buffer, "brand-slides.skill");
    expect(parsed.name).toBe("brand-slides");
    expect(parsed.extraFiles.map((f) => f.path).sort()).toEqual([
      "scripts/build.py",
      "slide-templates/cover.html",
    ]);
  });

  it("rejects a zip without SKILL.md", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "no skill");
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    await expect(parseSkillUpload(buffer, "empty.zip")).rejects.toThrow(/SKILL\.md/);
  });
});
