import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { cloneMarketplaceAgent } from "@lib/marketplace/clone";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await cloneMarketplaceAgent(supabase, user.id, agentId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao clonar";
    const status = message.includes("proprietário") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
