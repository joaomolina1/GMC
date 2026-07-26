/** Scopes available on platform API keys (and thus MCP tools). */
export const PLATFORM_API_SCOPES = [
  "agents:read",
  "agents:write",
  "agents:run",
  "flows:read",
  "flows:write",
  "flows:run",
  "knowledge:read",
  "knowledge:write",
  "marketplace:read",
] as const;

export type PlatformApiScope = (typeof PLATFORM_API_SCOPES)[number];

export const DEFAULT_ORCHESTRATION_SCOPES: PlatformApiScope[] = [
  "agents:read",
  "agents:write",
  "agents:run",
  "flows:read",
  "flows:write",
  "flows:run",
  "knowledge:read",
  "marketplace:read",
];

export const LEGACY_RUN_SCOPES: PlatformApiScope[] = ["agents:run", "flows:run"];

export function scopeImplies(have: string[], need: string): boolean {
  if (have.includes(need)) return true;
  // write implies read for the same resource
  if (need.endsWith(":read")) {
    const write = need.replace(/:read$/, ":write");
    if (have.includes(write)) return true;
  }
  return false;
}
