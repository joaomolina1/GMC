import { tryCreateServiceClient } from "@lib/supabase/server";

/** Best-effort purge of conversations older than 60 days (requires service role). */
export async function purgeExpiredConversations(): Promise<number> {
  const service = await tryCreateServiceClient();
  if (!service) return 0;

  const { data, error } = await service.rpc("purge_old_conversations", {
    retention_days: 60,
  });

  if (error) {
    console.warn("[conversations] purge failed:", error.message);
    return 0;
  }

  return typeof data === "number" ? data : 0;
}

export interface ConversationListItem {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationMessageItem {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  raw_content: unknown;
  created_at: string;
}
