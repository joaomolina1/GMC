/** Normalize skill_package_ids from JSONB / API payloads into a string array. */
export function parseSkillPackageIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return parseSkillPackageIds(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

export function withSkillPackageId(ids: unknown, packageId: string): string[] {
  const current = parseSkillPackageIds(ids);
  if (current.includes(packageId)) return current;
  return [...current, packageId];
}

export function withoutSkillPackageId(ids: unknown, packageId: string): string[] {
  return parseSkillPackageIds(ids).filter((id) => id !== packageId);
}
