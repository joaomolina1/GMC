import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANTHROPIC_MODEL_CATALOG,
  capabilitiesFromApi,
  getCatalogEntry,
  isModelSelectable,
} from "./anthropic-catalog";

interface AnthropicApiModel {
  id: string;
  display_name: string;
  capabilities?: Record<string, unknown>;
}

interface SyncResult {
  source: "api" | "catalog";
  upserted: number;
  apiCount?: number;
  disabled: number;
}

async function fetchAllAnthropicModels(): Promise<AnthropicApiModel[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const models: AnthropicApiModel[] = [];
  let afterId: string | undefined;

  for (let page = 0; page < 50; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetch(url.toString(), {
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

function rowFromCatalog(entry: (typeof ANTHROPIC_MODEL_CATALOG)[number]) {
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

export async function syncAnthropicModels(
  supabase: SupabaseClient
): Promise<SyncResult> {
  const apiModels = await fetchAllAnthropicModels();
  const apiIds = new Set(apiModels.map((m) => m.id));
  const rows: ReturnType<typeof rowFromCatalog>[] = [];

  if (apiModels.length > 0) {
    for (const apiModel of apiModels) {
      const catalog = getCatalogEntry(apiModel.id);
      rows.push({
        id: apiModel.id,
        provider: "anthropic",
        display_name: apiModel.display_name || catalog?.displayName || apiModel.id,
        capabilities: catalog?.capabilities ?? capabilitiesFromApi(apiModel.capabilities),
        input_price_per_mtok: catalog?.inputPricePerMtok ?? 3,
        output_price_per_mtok: catalog?.outputPricePerMtok ?? 15,
        enabled: catalog ? isModelSelectable(catalog.status) : true,
        status: catalog?.status ?? "active",
        tier: catalog?.tier ?? "other",
        sort_order: catalog?.sortOrder ?? 100,
        notes: catalog?.notes ?? null,
      });
    }

    for (const entry of ANTHROPIC_MODEL_CATALOG) {
      if (!apiIds.has(entry.id) && entry.status === "retired") {
        rows.push(rowFromCatalog(entry));
      }
    }
  } else {
    for (const entry of ANTHROPIC_MODEL_CATALOG) {
      rows.push(rowFromCatalog(entry));
    }
  }

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
