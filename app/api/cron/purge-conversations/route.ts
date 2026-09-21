import { NextResponse } from "next/server";
import { purgeExpiredConversations } from "@lib/chat/conversations";
import { cronUnauthorized } from "@lib/cron/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  const deleted = await purgeExpiredConversations();
  return NextResponse.json({ deleted, retention_days: 60 });
}
