import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { acessoDeMetadata, caminhoLivre, featureDoCaminho, homeDoUtilizador, podeUsar } from "@lib/features";

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
  // Escalas: app autónoma com ecrã de entrada próprio, sobre a mesma base de utilizadores.
  const isEscalasAuthRoute = pathname === "/escalas/entrar";
  const isEscalas = pathname === "/escalas" || pathname.startsWith("/escalas/");
  const isPublicRoute =
    pathname.startsWith("/auth") || pathname === "/login" || isTviboxAuthRoute || isEscalasAuthRoute;
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
    } else if (isEscalas) {
      url.pathname = "/escalas/entrar";
      url.search = pathname === "/escalas" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    } else {
      url.pathname = "/login";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  if (user) {
    const acesso = acessoDeMetadata(user.app_metadata);
    const isApi = pathname.startsWith("/api/");

    // Palavra-passe temporária: só a página de mudança (e as rotas da conta) ficam acessíveis.
    if (acesso.mustChangePassword && !caminhoLivre(pathname) && !isEscalasAuthRoute && !isTviboxAuthRoute) {
      if (isApi) {
        return NextResponse.json({ error: "Tem de mudar a palavra-passe antes de continuar." }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/conta/password";
      url.search = isEscalas ? "?app=escalas" : "";
      return NextResponse.redirect(url);
    }

    // Acesso por funcionalidade.
    const feature = featureDoCaminho(pathname);
    if (feature && !podeUsar(acesso, feature)) {
      if (isApi) {
        return NextResponse.json({ error: "Sem acesso a esta funcionalidade." }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = homeDoUtilizador(acesso);
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = homeDoUtilizador(acesso);
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isEscalasAuthRoute) {
      const url = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      const safe = next && next.startsWith("/escalas") && !next.startsWith("//") ? next : "/escalas";
      url.pathname = safe.split("?")[0];
      url.search = safe.includes("?") ? `?${safe.split("?")[1]}` : "";
      return NextResponse.redirect(url);
    }
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
