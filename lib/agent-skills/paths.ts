/** Directory that contains SKILL.md, with trailing slash (empty when at zip root). */
export function skillRootPrefix(skillMdPath: string): string {
  const normalized = skillMdPath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx + 1);
}

/** Paths relative to the folder that contains SKILL.md (Claude skill root). */
export function pathRelativeToSkillRoot(filePath: string, skillMdPath: string): string {
  const path = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = skillRootPrefix(skillMdPath);
  if (prefix && path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  return path;
}

export function isSkillMdPath(filePath: string): boolean {
  return /(^|\/)SKILL\.md$/i.test(filePath.replace(/\\/g, "/"));
}
