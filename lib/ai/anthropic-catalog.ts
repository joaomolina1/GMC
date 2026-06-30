export type ModelStatus = "active" | "legacy" | "deprecated" | "retired";

export interface AnthropicModelEntry {
  id: string;
  displayName: string;
  tier: "fable" | "opus" | "sonnet" | "haiku" | "other";
  status: ModelStatus;
  inputPricePerMtok: number;
  outputPricePerMtok: number;
  capabilities: string[];
  sortOrder: number;
  notes?: string;
}

/**
 * Canonical Anthropic model catalog (pricing from platform.claude.com/docs).
 * Sync merges with GET /v1/models for live availability.
 */
export const ANTHROPIC_MODEL_CATALOG: AnthropicModelEntry[] = [
  {
    id: "claude-fable-5",
    displayName: "Claude Fable 5",
    tier: "fable",
    status: "active",
    inputPricePerMtok: 10,
    outputPricePerMtok: 50,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 10,
  },
  {
    id: "claude-mythos-5",
    displayName: "Claude Mythos 5 (Glasswing)",
    tier: "fable",
    status: "active",
    inputPricePerMtok: 10,
    outputPricePerMtok: 50,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 11,
    notes: "Project Glasswing only",
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    tier: "opus",
    status: "active",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 20,
  },
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 21,
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 22,
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 23,
  },
  {
    id: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5 (20251101)",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 24,
  },
  {
    id: "claude-opus-4-1",
    displayName: "Claude Opus 4.1 (deprecated)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 25,
  },
  {
    id: "claude-opus-4-1-20250805",
    displayName: "Claude Opus 4.1 (20250805)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 26,
  },
  {
    id: "claude-opus-4-0",
    displayName: "Claude Opus 4 (deprecated)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 27,
  },
  {
    id: "claude-opus-4-20250514",
    displayName: "Claude Opus 4 (20250514)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 28,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    tier: "sonnet",
    status: "active",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 40,
  },
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    tier: "sonnet",
    status: "legacy",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 41,
  },
  {
    id: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5 (20250929)",
    tier: "sonnet",
    status: "legacy",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 42,
  },
  {
    id: "claude-sonnet-4-0",
    displayName: "Claude Sonnet 4 (deprecated)",
    tier: "sonnet",
    status: "deprecated",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 43,
  },
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4 (20250514)",
    tier: "sonnet",
    status: "deprecated",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 44,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    tier: "haiku",
    status: "active",
    inputPricePerMtok: 1,
    outputPricePerMtok: 5,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 50,
  },
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5 (20251001)",
    tier: "haiku",
    status: "active",
    inputPricePerMtok: 1,
    outputPricePerMtok: 5,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 51,
  },
  {
    id: "claude-3-haiku-20240307",
    displayName: "Claude Haiku 3 (deprecated)",
    tier: "haiku",
    status: "deprecated",
    inputPricePerMtok: 0.25,
    outputPricePerMtok: 1.25,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 52,
  },
  // Retired — kept disabled for historical agent versions
  {
    id: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet (retired)",
    tier: "sonnet",
    status: "retired",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 90,
  },
  {
    id: "claude-3-5-sonnet-20240620",
    displayName: "Claude 3.5 Sonnet (20240620, retired)",
    tier: "sonnet",
    status: "retired",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 91,
  },
  {
    id: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku (retired)",
    tier: "haiku",
    status: "retired",
    inputPricePerMtok: 0.8,
    outputPricePerMtok: 4,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 92,
  },
  {
    id: "claude-3-7-sonnet-20250219",
    displayName: "Claude 3.7 Sonnet (retired)",
    tier: "sonnet",
    status: "retired",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: ["chat", "vision", "tools", "thinking"],
    sortOrder: 93,
  },
  {
    id: "claude-3-opus-20240229",
    displayName: "Claude Opus 3 (retired)",
    tier: "opus",
    status: "retired",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: ["chat", "vision", "tools"],
    sortOrder: 94,
  },
];

/** Latest active model per tier — shown in agent builder by default */
export const LATEST_TIER_MODEL_IDS = [
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-haiku-4-5",
] as const;

const catalogById = new Map(ANTHROPIC_MODEL_CATALOG.map((m) => [m.id, m]));

export function getCatalogEntry(modelId: string): AnthropicModelEntry | undefined {
  return catalogById.get(modelId);
}

export function getCatalogPricing(modelId: string) {
  const entry = getCatalogEntry(modelId);
  if (!entry) return null;
  return {
    inputPricePerMtok: entry.inputPricePerMtok,
    outputPricePerMtok: entry.outputPricePerMtok,
  };
}

export function isModelSelectable(status: ModelStatus): boolean {
  return status === "active" || status === "legacy" || status === "deprecated";
}

export function capabilitiesFromApi(caps: Record<string, unknown> | undefined): string[] {
  const out = new Set<string>(["chat"]);
  if (!caps) return ["chat", "vision", "tools"];
  if ((caps.image_input as { supported?: boolean })?.supported) out.add("vision");
  if ((caps.pdf_input as { supported?: boolean })?.supported) out.add("pdf");
  if ((caps.code_execution as { supported?: boolean })?.supported) out.add("tools");
  if ((caps.thinking as { supported?: boolean })?.supported) out.add("thinking");
  return Array.from(out);
}
