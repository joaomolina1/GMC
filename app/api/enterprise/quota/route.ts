import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";
import { getQuotaStatus } from "@lib/enterprise/quotas";
import { isEntraConfigured } from "@lib/enterprise/entra";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quota = await getQuotaStatus(supabase, user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, auth_provider, entra_oid")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    quota,
    role: profile?.role ?? "user",
    auth_provider: profile?.auth_provider ?? "email",
    entra_configured: isEntraConfigured(),
  });
}
