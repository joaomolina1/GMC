import { parseHistoryBundle } from "./payload";
import type { HistoryGrain, HistoryPoint } from "./types";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, string>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function fetchHistoryBundle(
  sb: RpcClient,
  from: Date,
  grain: HistoryGrain
): Promise<HistoryPoint[]> {
  const { data, error } = await sb.rpc("chartbeat_history_bundle", {
    p_from: from.toISOString(),
    p_grain: grain,
  });
  if (error) throw new Error(error.message);
  return parseHistoryBundle(data);
}
