import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "./config";

export type ServiceClient = SupabaseClient;

export function createServiceClient(cfg: Pick<WorkerConfig, "supabaseUrl" | "serviceRoleKey">): ServiceClient {
  return createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-gmc-client": "clips-worker" } },
  });
}
