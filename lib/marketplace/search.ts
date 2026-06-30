/** Escape user input for PostgREST `.or()` filter strings (ilike patterns). */
export function escapePostgrestFilter(value: string): string {
  return value.replace(/[\\%_,().]/g, "\\$&");
}
