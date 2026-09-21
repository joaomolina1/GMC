import { CHANNELS } from "./channels";
import type { HistoryPayload, HistoryPoint, HistoryRange, Snapshot } from "./types";
import { historySpec } from "./format";

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

export function emptyHistory(range: HistoryRange, from: Date): HistoryPayload {
  const spec = historySpec(range);
  return { range, bucketSeconds: spec.bucketSeconds, from: from.toISOString(), points: [] };
}
