"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Logo } from "@/_components/Logo";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";

function regrasPassword(p: string): string | null {
  if (p.length < 10) return "Use pelo menos 10 caracteres.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Misture letras e números.";
  return null;
}

function MudarPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = params.get("app") === "escalas" ? "/escalas" : "/";
  const [email, setEmail] = useState<string | null>(null);
  const [obrigatoria, setObrigatoria] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState("");
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setEmail(data.user.email ?? null);
        setObrigatoria(data.user.app_metadata?.must_change_password === true);
      });
  }, [router]);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const r = regrasPassword(nova);
    if (r) return setErro(r);
    if (nova !== conf) return setErro("A confirmação não coincide com a nova palavra-passe.");
    if (nova === atual) return setErro("A nova palavra-passe tem de ser diferente da atual.");
    if (!email) return;
    setAGravar(true);
    const sb = createClient();
    try {
      const { error: e1 } = await sb.auth.signInWithPassword({ email, password: atual });
      if (e1) throw new Error("A palavra-passe atual não está correta.");
      const { error: e2 } = await sb.auth.updateUser({ password: nova });
      if (e2) throw new Error(e2.message);
      const { data: ok, error: e3 } = await sb.rpc("conta_confirmar_password_alterada");
      if (e3) throw new Error(e3.message);
      if (ok === false) throw new Error("A palavra-passe não foi alterada. Tente de novo.");
      await sb.auth.refreshSession();
      router.replace(destino);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mudar a palavra-passe.");
    } finally {
      setAGravar(false);
    }
  }

  async function sair() {
    await createClient().auth.signOut();
    router.replace(destino === "/escalas" ? "/escalas/entrar" : "/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8">
          <Logo variant="full" size="md" />
        </div>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <KeyRound size={22} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{obrigatoria ? "Defina a sua palavra-passe" : "Mudar palavra-passe"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {obrigatoria
            ? "Entrou com uma palavra-passe temporária. Escolha uma pessoal para continuar."
            : "Escolha uma nova palavra-passe para a sua conta."}
          {email && <span className="mt-1 block font-mono text-xs text-slate-400">{email}</span>}
        </p>
        <form onSubmit={submeter} className="mt-8 space-y-4">
          <Input label="Palavra-passe atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
          <Input
            label="Nova palavra-passe"
            type="password"
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            hint="Pelo menos 10 caracteres, com letras e números."
            required
          />
          <Input label="Confirmar nova palavra-passe" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} required />
          {erro && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
          <Button type="submit" size="lg" className="w-full" disabled={aGravar || !email}>
            {aGravar ? "A gravar..." : "Guardar e continuar"}
          </Button>
        </form>
        <div className="mt-6 flex justify-center gap-4 text-sm">
          {!obrigatoria && (
            <button type="button" onClick={() => router.back()} className="text-slate-500 hover:text-slate-800">
              Voltar
            </button>
          )}
          <button type="button" onClick={sair} className="text-slate-500 hover:text-slate-800">
            Terminar sessão
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MudarPassword />
    </Suspense>
  );
}
