import { rpcJson, withUser } from "@lib/tvibox/api";

export async function POST() {
  return withUser(({ supabase }) => rpcJson(supabase, "tvibox_start_plus"));
}
