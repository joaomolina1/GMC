import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login");
  // TVI BOX tem o seu próprio ecrã de entrada (marca própria) sobre a mesma base de utilizadores.
  const isTviboxAuthRoute = pathname === "/tvibox/entrar";
  const isTvibox = pathname === "/tvibox" || pathname.startsWith("/tvibox/");
  const isPublicRoute = pathname.startsWith("/auth") || pathname === "/login" || isTviboxAuthRoute;
  const isV1Api = pathname.startsWith("/api/v1/");
  // Cron handlers authenticate with CRON_SECRET inside the route, not a user cookie.
  const isCronApi = pathname.startsWith("/api/cron/");

  if (!user && !isPublicRoute && !isV1Api && !isCronApi) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    if (isTvibox) {
      url.pathname = "/tvibox/entrar";
      url.search = pathname === "/tvibox" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    } else {
      url.pathname = "/login";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isTviboxAuthRoute) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    url.pathname = next && next.startsWith("/tvibox") && !next.startsWith("//") ? next.split("?")[0] : "/tvibox";
    url.search = next && next.includes("?") ? `?${next.split("?")[1]}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
