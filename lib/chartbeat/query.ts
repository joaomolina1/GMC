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
  grain: HistoryGrain,
  to?: Date
): Promise<HistoryPoint[]> {
  const args: Record<string, string> = {
    p_from: from.toISOString(),
    p_grain: grain,
  };
  if (to) args.p_to = to.toISOString();
  const { data, error } = await sb.rpc("chartbeat_history_bundle", args);
  if (error) throw new Error(error.message);
  return parseHistoryBundle(data);
}
