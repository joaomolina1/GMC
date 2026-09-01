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

const CHAT_VISION_TOOLS_THINKING = ["chat", "vision", "tools", "thinking", "effort"];
const CHAT_VISION_TOOLS = ["chat", "vision", "tools"];

/**
 * Canonical Anthropic model catalog (pricing from platform.claude.com/docs).
 * Sync treats GET /v1/models as source of truth for availability.
 */
export const ANTHROPIC_MODEL_CATALOG: AnthropicModelEntry[] = [
  {
    id: "claude-fable-5",
    displayName: "Claude Fable 5",
    tier: "fable",
    status: "active",
    inputPricePerMtok: 10,
    outputPricePerMtok: 50,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 10,
  },
  {
    id: "claude-mythos-5",
    displayName: "Claude Mythos 5 (Glasswing)",
    tier: "fable",
    status: "active",
    inputPricePerMtok: 10,
    outputPricePerMtok: 50,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 11,
    notes: "Project Glasswing only",
  },
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    tier: "opus",
    status: "active",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 20,
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 21,
  },
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 22,
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 23,
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 24,
  },
  {
    id: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5 (20251101)",
    tier: "opus",
    status: "legacy",
    inputPricePerMtok: 5,
    outputPricePerMtok: 25,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 25,
  },
  {
    id: "claude-opus-4-1",
    displayName: "Claude Opus 4.1 (deprecated)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 26,
  },
  {
    id: "claude-opus-4-1-20250805",
    displayName: "Claude Opus 4.1 (20250805)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 27,
  },
  {
    id: "claude-opus-4-0",
    displayName: "Claude Opus 4 (deprecated)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 28,
  },
  {
    id: "claude-opus-4-20250514",
    displayName: "Claude Opus 4 (20250514)",
    tier: "opus",
    status: "deprecated",
    inputPricePerMtok: 15,
    outputPricePerMtok: 75,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 29,
  },
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    tier: "sonnet",
    status: "active",
    inputPricePerMtok: 2,
    outputPricePerMtok: 10,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 40,
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    tier: "sonnet",
    status: "legacy",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 41,
  },
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    tier: "sonnet",
    status: "legacy",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 42,
  },
  {
    id: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5 (20250929)",
    tier: "sonnet",
    status: "legacy",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS_THINKING,
    sortOrder: 43,
  },
  {
    id: "claude-sonnet-4-0",
    displayName: "Claude Sonnet 4 (deprecated)",
    tier: "sonnet",
    status: "deprecated",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 44,
  },
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4 (20250514)",
    tier: "sonnet",
    status: "deprecated",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 45,
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
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 52,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet (retired)",
    tier: "sonnet",
    status: "retired",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 90,
  },
  {
    id: "claude-3-5-sonnet-20240620",
    displayName: "Claude 3.5 Sonnet (20240620, retired)",
    tier: "sonnet",
    status: "retired",
    inputPricePerMtok: 3,
    outputPricePerMtok: 15,
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 91,
  },
  {
    id: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku (retired)",
    tier: "haiku",
    status: "retired",
    inputPricePerMtok: 0.8,
    outputPricePerMtok: 4,
    capabilities: CHAT_VISION_TOOLS,
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
    capabilities: CHAT_VISION_TOOLS,
    sortOrder: 94,
  },
];

/** Latest active model per tier — shown in agent builder by default */
export const LATEST_TIER_MODEL_IDS = [
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-haiku-4-5",
  "claude-fable-5",
] as const;

const catalogById = new Map(ANTHROPIC_MODEL_CATALOG.map((m) => [m.id, m]));

export function getCatalogEntry(modelId: string): AnthropicModelEntry | undefined {
  return catalogById.get(modelId);
}

export function getCatalogPricing(modelId: string) {
  const entry = getCatalogEntry(modelId) ?? inferUnknownModel(modelId);
  return {
    inputPricePerMtok: entry.inputPricePerMtok,
    outputPricePerMtok: entry.outputPricePerMtok,
  };
}

export function isModelSelectable(status: ModelStatus): boolean {
  return status === "active" || status === "legacy" || status === "deprecated";
}

function capSupported(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "object" && value !== null && "supported" in value) {
    return Boolean((value as { supported?: boolean }).supported);
  }
  return false;
}

export function capabilitiesFromApi(caps: Record<string, unknown> | undefined): string[] {
  const out = new Set<string>(["chat"]);
  if (!caps) return ["chat", "vision", "tools"];
  if (capSupported(caps.image_input)) out.add("vision");
  if (capSupported(caps.pdf_input)) out.add("pdf");
  if (capSupported(caps.code_execution) || capSupported(caps.tool_use)) out.add("tools");
  if (capSupported(caps.thinking)) out.add("thinking");
  if (capSupported(caps.effort)) out.add("effort");
  return Array.from(out);
}

export function inferTier(modelId: string): AnthropicModelEntry["tier"] {
  if (modelId.includes("fable") || modelId.includes("mythos")) return "fable";
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  return "other";
}

export function inferPricing(modelId: string): { inputPricePerMtok: number; outputPricePerMtok: number } {
  const catalog = getCatalogEntry(modelId);
  if (catalog) {
    return {
      inputPricePerMtok: catalog.inputPricePerMtok,
      outputPricePerMtok: catalog.outputPricePerMtok,
    };
  }

  const tier = inferTier(modelId);
  if (tier === "fable") return { inputPricePerMtok: 10, outputPricePerMtok: 50 };
  if (tier === "opus") {
    if (/opus-4-[01](\b|-)|opus-4-2025|claude-3-opus/.test(modelId)) {
      return { inputPricePerMtok: 15, outputPricePerMtok: 75 };
    }
    return { inputPricePerMtok: 5, outputPricePerMtok: 25 };
  }
  if (tier === "sonnet") {
    if (/sonnet-5(\b|-)/.test(modelId)) return { inputPricePerMtok: 2, outputPricePerMtok: 10 };
    return { inputPricePerMtok: 3, outputPricePerMtok: 15 };
  }
  if (tier === "haiku") {
    if (modelId.includes("claude-3-haiku")) return { inputPricePerMtok: 0.25, outputPricePerMtok: 1.25 };
    if (modelId.includes("3-5-haiku")) return { inputPricePerMtok: 0.8, outputPricePerMtok: 4 };
    return { inputPricePerMtok: 1, outputPricePerMtok: 5 };
  }
  return { inputPricePerMtok: 3, outputPricePerMtok: 15 };
}

export function inferSortOrder(modelId: string): number {
  const catalog = getCatalogEntry(modelId);
  if (catalog) return catalog.sortOrder;
  const tier = inferTier(modelId);
  const base = { fable: 12, opus: 19, sonnet: 39, haiku: 49, other: 80 }[tier];
  return /\d{8}/.test(modelId) ? base + 6 : base;
}

export function inferUnknownModel(
  modelId: string,
  api?: { display_name?: string; capabilities?: Record<string, unknown> }
): AnthropicModelEntry {
  const catalog = getCatalogEntry(modelId);
  if (catalog) return catalog;

  const pricing = inferPricing(modelId);
  const apiCaps = capabilitiesFromApi(api?.capabilities);
  const capabilities =
    api?.capabilities && apiCaps.length > 1
      ? apiCaps
      : inferTier(modelId) === "haiku"
        ? ["chat", "vision", "tools", "thinking"]
        : [...CHAT_VISION_TOOLS_THINKING];

  return {
    id: modelId,
    displayName: api?.display_name || modelId,
    tier: inferTier(modelId),
    status: "active",
    inputPricePerMtok: pricing.inputPricePerMtok,
    outputPricePerMtok: pricing.outputPricePerMtok,
    capabilities,
    sortOrder: inferSortOrder(modelId),
  };
}

export function modelHasCapability(modelId: string, capability: string): boolean {
  const entry = getCatalogEntry(modelId) ?? inferUnknownModel(modelId);
  return entry.capabilities.includes(capability);
}
