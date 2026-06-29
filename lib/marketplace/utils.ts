export function normalizeProfileRelation(
  profiles: unknown
): { id: string; full_name: string | null; avatar_url: string | null } | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) {
    const p = profiles[0];
    if (!p) return null;
    return {
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? null,
      avatar_url: (p.avatar_url as string | null) ?? null,
    };
  }
  const p = profiles as { id: string; full_name: string | null; avatar_url: string | null };
  return {
    id: p.id,
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
  };
}
