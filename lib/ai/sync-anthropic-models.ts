import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANTHROPIC_MODEL_CATALOG,
  capabilitiesFromApi,
  getCatalogEntry,
  inferUnknownModel,
  isModelSelectable,
  type AnthropicModelEntry,
} from "./anthropic-catalog";

export interface AnthropicApiModel {
  id: string;
  display_name: string;
  created_at?: string;
  capabilities?: Record<string, unknown>;
}

export interface ModelRow {
  id: string;
  provider: "anthropic";
  display_name: string;
  capabilities: string[];
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  enabled: boolean;
  status: AnthropicModelEntry["status"];
  tier: AnthropicModelEntry["tier"];
  sort_order: number;
  notes: string | null;
}

interface SyncResult {
  source: "api" | "catalog";
  upserted: number;
  apiCount?: number;
  disabled: number;
}

export async function fetchAllAnthropicModels(
  fetchImpl: typeof fetch = fetch
): Promise<AnthropicApiModel[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const models: AnthropicApiModel[] = [];
  let afterId: string | undefined;

  for (let page = 0; page < 50; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetchImpl(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!res.ok) break;

    const body = (await res.json()) as {
      data?: AnthropicApiModel[];
      has_more?: boolean;
      last_id?: string;
    };

    const batch = body.data ?? [];
    models.push(...batch);

    if (!body.has_more || !body.last_id || batch.length === 0) break;
    afterId = body.last_id;
  }

  return models;
}

export function rowFromCatalog(entry: AnthropicModelEntry): ModelRow {
  return {
    id: entry.id,
    provider: "anthropic",
    display_name: entry.displayName,
    capabilities: entry.capabilities,
    input_price_per_mtok: entry.inputPricePerMtok,
    output_price_per_mtok: entry.outputPricePerMtok,
    enabled: isModelSelectable(entry.status),
    status: entry.status,
    tier: entry.tier,
    sort_order: entry.sortOrder,
    notes: entry.notes ?? null,
  };
}

/** API is source of truth for availability; catalog fills pricing/tier/sort. */
export function rowFromApiModel(apiModel: AnthropicApiModel): ModelRow {
  const catalog = getCatalogEntry(apiModel.id);
  const inferred = inferUnknownModel(apiModel.id, {
    display_name: apiModel.display_name,
    capabilities: apiModel.capabilities,
  });
  const capabilities = catalog
    ? catalog.capabilities
    : apiModel.capabilities
      ? capabilitiesFromApi(apiModel.capabilities)
      : inferred.capabilities;

  return {
    id: apiModel.id,
    provider: "anthropic",
    display_name: apiModel.display_name || catalog?.displayName || apiModel.id,
    capabilities,
    input_price_per_mtok: catalog?.inputPricePerMtok ?? inferred.inputPricePerMtok,
    output_price_per_mtok: catalog?.outputPricePerMtok ?? inferred.outputPricePerMtok,
    enabled: true,
    status: catalog?.status === "retired" ? "legacy" : (catalog?.status ?? "active"),
    tier: catalog?.tier ?? inferred.tier,
    sort_order: catalog?.sortOrder ?? inferred.sortOrder,
    notes: catalog?.notes ?? null,
  };
}

export function buildModelRows(apiModels: AnthropicApiModel[]): ModelRow[] {
  if (apiModels.length === 0) {
    return ANTHROPIC_MODEL_CATALOG.map(rowFromCatalog);
  }

  const apiIds = new Set(apiModels.map((m) => m.id));
  const rows = apiModels.map(rowFromApiModel);

  for (const entry of ANTHROPIC_MODEL_CATALOG) {
    if (!apiIds.has(entry.id) && entry.status === "retired") {
      rows.push(rowFromCatalog(entry));
    }
  }

  return rows;
}

export async function syncAnthropicModels(
  supabase: SupabaseClient,
  fetchImpl: typeof fetch = fetch
): Promise<SyncResult> {
  const apiModels = await fetchAllAnthropicModels(fetchImpl);
  const rows = buildModelRows(apiModels);
  const apiIds = new Set(apiModels.map((m) => m.id));

  const { error } = await supabase.from("models").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  let disabled = 0;
  if (apiModels.length > 0) {
    const { data: existing } = await supabase
      .from("models")
      .select("id")
      .eq("provider", "anthropic");

    const toDisable = (existing ?? [])
      .map((m) => m.id)
      .filter((id) => !apiIds.has(id) && getCatalogEntry(id)?.status !== "retired");

    if (toDisable.length > 0) {
      await supabase.from("models").update({ enabled: false, status: "retired" }).in("id", toDisable);
      disabled = toDisable.length;
    }
  }

  return {
    source: apiModels.length > 0 ? "api" : "catalog",
    upserted: rows.length,
    apiCount: apiModels.length || undefined,
    disabled,
  };
}
