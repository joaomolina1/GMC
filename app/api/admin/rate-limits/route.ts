import { NextResponse } from "next/server";
import { requireAdmin } from "@lib/enterprise/auth";
import { logAudit } from "@lib/audit";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("rate_limits")
    .select("*, profiles(email)")
    .order("endpoint");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { user_id, endpoint, requests_per_minute } = body;

  if (!endpoint || !requests_per_minute) {
    return NextResponse.json({ error: "endpoint and requests_per_minute required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rate_limits")
    .insert({
      user_id: user_id ?? null,
      endpoint,
      requests_per_minute,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "enterprise.rate_limit.create",
    entityType: "rate_limit",
    entityId: data.id,
    metadata: { endpoint, requests_per_minute },
  });

  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json();
  const { id, requests_per_minute } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("rate_limits")
    .update({ requests_per_minute })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actorId: user.id,
    action: "enterprise.rate_limit.update",
    entityType: "rate_limit",
    entityId: id,
  });

  return NextResponse.json(data);
}
