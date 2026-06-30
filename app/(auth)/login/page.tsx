"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Search, Eye, Library } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Logo } from "@/_components/Logo";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";
import { isEntraConfigured, getAzureTenantId, isEmailDomainAllowed, shouldRestrictSignupDomains } from "@lib/enterprise/entra";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState<string | null>(null);
  const entraEnabled = isEntraConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();

    try {
      if (isSignUp) {
        if (shouldRestrictSignupDomains() && !isEmailDomainAllowed(email)) {
          throw new Error(
            "Registo restrito a domínios corporativos autorizados. Use o SSO Microsoft ou contacte o administrador."
          );
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (data.session) {
          router.push("/");
          router.refresh();
          return;
        }

        setSignupEmailSent(email.trim());
        setPassword("");
        setFullName("");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function handleEntraLogin() {
    setError("");
    setSsoLoading(true);
    const supabase = createClient();
    const tenantId = getAzureTenantId();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "email profile openid",
          queryParams: {
            prompt: "select_account",
            ...(tenantId ? { tenant: tenantId } : {}),
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar SSO");
      setSsoLoading(false);
    }
  }

  const features = [
    { icon: Bot, text: "Crie agentes de IA personalizados" },
    { icon: Search, text: "Pesquisa na web em tempo real" },
    { icon: Eye, text: "Análise de imagens e documentos" },
    { icon: Library, text: "Conhecimento próprio com RAG" },
  ];

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-20 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <Logo variant="full" size="lg" />
        </div>
        <div className="relative text-white">
          <h2 className="text-3xl font-bold leading-tight">
            Plataforma de Agentes IA
          </h2>
          <p className="mt-3 max-w-md text-white/80">
            A plataforma interna do Grupo Media Capital para criar, configurar e operar agentes de
            inteligência artificial.
          </p>
          <ul className="mt-8 space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© Grupo Media Capital · Fase 6</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Logo variant="full" size="md" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            {signupEmailSent
              ? "Confirme o seu email"
              : isSignUp
                ? "Criar conta"
                : "Bem-vindo de volta"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {signupEmailSent
              ? "Falta apenas um passo para activar a sua conta."
              : isSignUp
                ? "Registe-se para começar a usar a plataforma."
                : "Inicie sessão para aceder aos seus agentes."}
          </p>

          {signupEmailSent ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                <p className="font-medium">Email de confirmação enviado</p>
                <p className="mt-2 leading-relaxed text-emerald-800">
                  Enviámos um email para{" "}
                  <span className="font-semibold">{signupEmailSent}</span> para confirmar a sua
                  conta. Abra a mensagem e clique no link de confirmação antes de iniciar sessão.
                </p>
                <p className="mt-2 text-emerald-700">
                  Se não encontrar o email, verifique a pasta de spam ou lixo.
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={() => {
                  setSignupEmailSent(null);
                  setIsSignUp(false);
                  setError("");
                }}
              >
                Ir para login
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {isSignUp && (
              <Input
                label="Nome completo"
                type="text"
                placeholder="O seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="nome@mediacapital.pt"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading || ssoLoading}>
              {loading ? "A processar..." : isSignUp ? "Registar" : "Entrar"}
            </Button>
          </form>
          )}

          {!signupEmailSent && entraEnabled && !isSignUp && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-canvas px-2 text-slate-400">ou</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled={ssoLoading || loading}
                onClick={handleEntraLogin}
              >
                {ssoLoading ? "A redirecionar..." : "Entrar com Microsoft (Entra ID)"}
              </Button>
            </>
          )}

          {!signupEmailSent && (
          <p className="mt-6 text-center text-sm text-slate-500">
            {isSignUp ? "Já tem conta?" : "Não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setSignupEmailSent(null);
                setError("");
              }}
              className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              {isSignUp ? "Entrar" : "Registar"}
            </button>
          </p>
          )}
        </div>
      </div>
    </div>
  );
}
