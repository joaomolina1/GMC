"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@lib/supabase/client";
import { isEntraConfigured, getAzureTenantId, isEmailDomainAllowed, shouldRestrictSignupDomains } from "@lib/enterprise/entra";
import { TviBoxLogo } from "./Logo";

interface Poster {
  slug: string;
  title: string;
  url: string;
  palette: { from: string; to: string };
}

export function EntrarClient({ posters, next }: { posters: Poster[]; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const entraEnabled = isEntraConfigured();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        if (shouldRestrictSignupDomains() && !isEmailDomainAllowed(email)) {
          throw new Error("Registo restrito a domínios corporativos autorizados.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session) {
          router.push(next);
          router.refresh();
          return;
        }
        setEmailSent(email.trim());
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function entra() {
    setError("");
    const supabase = createClient();
    const tenantId = getAzureTenantId();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "email profile openid",
        queryParams: { prompt: "select_account", ...(tenantId ? { tenant: tenantId } : {}) },
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="tb-auth">
      <div className="tb-auth-card">
        <TviBoxLogo size={46} layout="stack" />
        <div className="tb-auth-posters" aria-hidden>
          {posters.slice(0, 8).map((p) => (
            <div
              key={p.slug}
              title={p.title}
              style={{
                backgroundImage: `url(${p.url}), linear-gradient(155deg, ${p.palette.from}, ${p.palette.to})`,
              }}
            />
          ))}
        </div>
        <h1>{emailSent ? "Confirma o email" : mode === "signup" ? "Criar conta" : "Entrar"}</h1>
        <p className="lead">
          {emailSent
            ? `Enviámos um email para ${emailSent}. Abre a ligação de confirmação e volta aqui para entrar.`
            : "Folhetins verticais da TVI em episódios de 90 segundos. O primeiro episódio de cada série é grátis — usa a tua conta GMC."}
        </p>

        {emailSent ? (
          <button
            type="button"
            className="tb-btn-primary"
            style={{ maxWidth: "none" }}
            onClick={() => {
              setEmailSent(null);
              setMode("login");
            }}
          >
            Ir para login
          </button>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mode === "signup" && (
              <div className="tb-field">
                <label htmlFor="tb-name">Nome</label>
                <input id="tb-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            <div className="tb-field">
              <label htmlFor="tb-email">Email</label>
              <input
                id="tb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="nome@mediacapital.pt"
              />
            </div>
            <div className="tb-field">
              <label htmlFor="tb-pass">Password</label>
              <input
                id="tb-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
              />
            </div>
            {error && <div className="tb-error">{error}</div>}
            <button type="submit" className="tb-btn-primary" style={{ maxWidth: "none" }} disabled={loading}>
              {loading ? "A processar…" : mode === "signup" ? "Registar" : "Entrar"}
            </button>
            {entraEnabled && mode === "login" && (
              <button type="button" className="tb-btn-ghost" onClick={entra} style={{ padding: 13 }}>
                Entrar com Microsoft (Entra ID)
              </button>
            )}
          </form>
        )}

        {!emailSent && (
          <p className="tb-auth-foot">
            {mode === "signup" ? "Já tens conta?" : "Ainda não tens conta?"}{" "}
            <button
              type="button"
              className="tb-link"
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
              }}
            >
              {mode === "signup" ? "Entrar" : "Registar"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
