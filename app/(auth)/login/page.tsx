"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Search, Eye, Library } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Logo } from "@/_components/Logo";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        router.push("/");
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
        <p className="relative text-xs text-white/60">© Grupo Media Capital · Fase 1</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Logo variant="full" size="md" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            {isSignUp ? "Criar conta" : "Bem-vindo de volta"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSignUp
              ? "Registe-se para começar a usar a plataforma."
              : "Inicie sessão para aceder aos seus agentes."}
          </p>

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
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "A processar..." : isSignUp ? "Registar" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isSignUp ? "Já tem conta?" : "Não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              {isSignUp ? "Entrar" : "Registar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
