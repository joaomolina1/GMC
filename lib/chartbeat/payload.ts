import { CHANNELS } from "./channels";
import type { HistoryGrain, HistoryPayload, HistoryPoint, HistoryRange, Snapshot } from "./types";

export interface LivePayload {
  snapshot: Snapshot;
  stale: boolean;
  lastIngest: { capturedAt: string; status: string; error: string | null } | null;
  channels: typeof CHANNELS;
}

export function toLivePayload(
  snapshot: Snapshot,
  lastIngest: LivePayload["lastIngest"],
  now = Date.now()
): LivePayload {
  const ageMs = now - new Date(snapshot.capturedAt).getTime();
  return {
    snapshot,
    stale: ageMs > 3 * 60_000,
    lastIngest,
    channels: CHANNELS,
  };
}

export function parseHistoryRows(
  rows: { bucket: string | Date; people: Record<string, number> | string | null }[]
): HistoryPoint[] {
  return rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString(),
    people:
      typeof r.people === "string"
        ? (JSON.parse(r.people) as Record<string, number>)
        : (r.people ?? {}),
  }));
}

/** Aceita o jsonb da RPC `chartbeat_history_bundle` (array, string, ou `{points}`). */
export function parseHistoryBundle(data: unknown): HistoryPoint[] {
  if (data == null) return [];
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return parseHistoryRows(value as { bucket: string; people: Record<string, number> }[]);
  }
  if (value && typeof value === "object" && Array.isArray((value as { points?: unknown }).points)) {
    return parseHistoryRows(
      (value as { points: { bucket: string; people: Record<string, number> }[] }).points
    );
  }
  return [];
}

export function emptyHistory(range: HistoryRange, grain: HistoryGrain, from: Date): HistoryPayload {
  return { range, grain, from: from.toISOString(), points: [] };
}
