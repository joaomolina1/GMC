export function extractFileIdsFromPayload(payload: unknown): string[] {
  const ids = new Set<string>();

  function walk(value: unknown): void {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (typeof record.file_id === "string" && record.file_id.trim()) {
      ids.add(record.file_id);
    }

    for (const nested of Object.values(record)) {
      walk(nested);
    }
  }

  walk(payload);
  return Array.from(ids);
}
