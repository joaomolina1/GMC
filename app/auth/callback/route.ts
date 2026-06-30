import { NextResponse } from "next/server";
import { createClient } from "@lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const meta = data.user.user_metadata ?? {};
      await supabase
        .from("profiles")
        .update({
          full_name: meta.full_name ?? meta.name ?? undefined,
          avatar_url: meta.avatar_url ?? undefined,
          entra_oid: meta.sub ?? meta.oid ?? undefined,
          auth_provider: data.user.app_metadata?.provider ?? "azure",
        })
        .eq("id", data.user.id);

      const safeNext =
        next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
