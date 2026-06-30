import { NextResponse } from "next/server";
import { purgeExpiredConversations } from "@lib/chat/conversations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await purgeExpiredConversations();
  return NextResponse.json({ deleted, retention_days: 60 });
}
